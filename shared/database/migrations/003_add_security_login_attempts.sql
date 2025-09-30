-- ROIPLATFORM 보안 정책 및 로그인 실패 관리 추가 스키마
-- 작성일: 2025-09-30
-- 설명: 로그인 시도 제한, 보안 정책, UTF-8 인코딩 지원

-- 1. 로그인 시도 실패 추적 테이블
CREATE TABLE login_attempts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL,
    ip_address INET NOT NULL,
    username VARCHAR(255), -- null일 수 있음 (잘못된 사용자명 시도)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 유효한 사용자인 경우만
    attempt_type VARCHAR(20) NOT NULL DEFAULT 'login', -- login, sso_callback, password_reset
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason VARCHAR(100), -- invalid_credentials, account_locked, invalid_project, etc.
    user_agent TEXT,
    session_token VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- 프로젝트 코드가 존재하는 경우만 참조 (NULL 허용)
    CONSTRAINT fk_login_attempts_project_code 
        FOREIGN KEY (project_code) REFERENCES projects(project_code) ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED
);

-- 2. 보안 정책 설정 테이블
CREATE TABLE security_policies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL REFERENCES projects(project_code) ON DELETE CASCADE,
    policy_type VARCHAR(50) NOT NULL, -- login_attempts, session_timeout, password_policy
    policy_config JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_project_policy_type UNIQUE (project_code, policy_type)
);

-- 3. 프로젝트 접근 로그 테이블 (개발환경 오류 추적)
CREATE TABLE project_access_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50), -- NULL 허용 (존재하지 않는 코드 접근)
    ip_address INET NOT NULL,
    requested_path VARCHAR(500),
    access_result VARCHAR(50) NOT NULL, -- success, project_not_found, redirect_to_public, blocked
    redirect_target VARCHAR(500),
    user_agent TEXT,
    referer TEXT,
    environment VARCHAR(20) DEFAULT 'production', -- development, production
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. 기존 테이블 인코딩 확인 및 수정
-- PostgreSQL에서 데이터베이스 전체 인코딩을 UTF-8로 설정 확인
-- (이미 UTF-8로 생성되어 있으므로 별도 변경 불필요)

-- 5. 기본 보안 정책 데이터 삽입
-- public 프로젝트 기본 보안 정책
INSERT INTO security_policies (project_code, policy_type, policy_config, enabled) 
VALUES 
    ('public', 'login_attempts', '{
        "max_attempts": 5,
        "lockout_duration_minutes": 5,
        "tracking_window_minutes": 30,
        "redirect_on_exceed": true,
        "redirect_target": "/public"
    }', true),
    ('public', 'session_timeout', '{
        "idle_timeout_minutes": 60,
        "absolute_timeout_hours": 24,
        "remember_me_days": 30
    }', true),
    ('public', 'password_policy', '{
        "min_length": 8,
        "require_uppercase": false,
        "require_lowercase": false,
        "require_numbers": false,
        "require_special": false,
        "prevent_common_passwords": true
    }', true)
ON CONFLICT (project_code, policy_type) DO NOTHING;

-- 6. 인덱스 생성
CREATE INDEX idx_login_attempts_project_ip ON login_attempts(project_code, ip_address);
CREATE INDEX idx_login_attempts_user_time ON login_attempts(user_id, created_at);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, created_at);
CREATE INDEX idx_login_attempts_success ON login_attempts(project_code, success, created_at);

CREATE INDEX idx_security_policies_project_type ON security_policies(project_code, policy_type);
CREATE INDEX idx_security_policies_enabled ON security_policies(project_code, enabled) WHERE enabled = true;

CREATE INDEX idx_project_access_logs_project_time ON project_access_logs(project_code, created_at);
CREATE INDEX idx_project_access_logs_ip_time ON project_access_logs(ip_address, created_at);
CREATE INDEX idx_project_access_logs_result ON project_access_logs(access_result, created_at);
CREATE INDEX idx_project_access_logs_environment ON project_access_logs(environment, created_at);

-- 7. RLS 정책 설정
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_access_logs ENABLE ROW LEVEL SECURITY;

-- 프로젝트별 격리 정책
CREATE POLICY project_isolation_login_attempts ON login_attempts
    USING (project_code = current_setting('app.current_project_code', true) OR 
           current_setting('app.user_role', true) = 'PROVIDER_ADMIN');

CREATE POLICY project_isolation_security_policies ON security_policies
    USING (project_code = current_setting('app.current_project_code', true));

CREATE POLICY project_isolation_access_logs ON project_access_logs
    USING (project_code = current_setting('app.current_project_code', true) OR
           current_setting('app.user_role', true) = 'PROVIDER_ADMIN');

-- 8. 유틸리티 함수들

-- 로그인 시도 횟수 확인 함수
CREATE OR REPLACE FUNCTION check_login_attempts(
    p_project_code VARCHAR(50),
    p_ip_address INET,
    p_username VARCHAR(255) DEFAULT NULL
)
RETURNS TABLE(
    attempts_count INTEGER,
    is_locked BOOLEAN,
    lockout_expires_at TIMESTAMPTZ
) AS $$
DECLARE
    policy_config JSONB;
    max_attempts INTEGER;
    lockout_duration_minutes INTEGER;
    tracking_window_minutes INTEGER;
    attempt_count INTEGER;
    last_failure TIMESTAMPTZ;
BEGIN
    -- 보안 정책 조회
    SELECT sp.policy_config INTO policy_config
    FROM security_policies sp
    WHERE sp.project_code = p_project_code 
    AND sp.policy_type = 'login_attempts'
    AND sp.enabled = true;
    
    -- 기본값 설정
    max_attempts := COALESCE((policy_config->>'max_attempts')::INTEGER, 5);
    lockout_duration_minutes := COALESCE((policy_config->>'lockout_duration_minutes')::INTEGER, 5);
    tracking_window_minutes := COALESCE((policy_config->>'tracking_window_minutes')::INTEGER, 30);
    
    -- 최근 시도 횟수 조회
    SELECT COUNT(*), MAX(created_at)
    INTO attempt_count, last_failure
    FROM login_attempts la
    WHERE la.project_code = p_project_code
    AND la.ip_address = p_ip_address
    AND (p_username IS NULL OR la.username = p_username)
    AND la.success = false
    AND la.created_at > CURRENT_TIMESTAMP - INTERVAL '1 minute' * tracking_window_minutes;
    
    RETURN QUERY SELECT 
        attempt_count,
        attempt_count >= max_attempts,
        CASE WHEN attempt_count >= max_attempts 
             THEN last_failure + INTERVAL '1 minute' * lockout_duration_minutes 
             ELSE NULL 
        END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 로그인 시도 기록 함수
CREATE OR REPLACE FUNCTION record_login_attempt(
    p_project_code VARCHAR(50),
    p_ip_address INET,
    p_username VARCHAR(255),
    p_user_id UUID,
    p_success BOOLEAN,
    p_failure_reason VARCHAR(100) DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_session_token VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    attempt_id UUID;
BEGIN
    INSERT INTO login_attempts (
        project_code, ip_address, username, user_id, success, 
        failure_reason, user_agent, session_token
    )
    VALUES (
        p_project_code, p_ip_address, p_username, p_user_id, p_success,
        p_failure_reason, p_user_agent, p_session_token
    )
    RETURNING id INTO attempt_id;
    
    RETURN attempt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 데이터 정리 함수 (오래된 로그 삭제)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- 30일 이상 된 로그인 시도 기록 삭제
    DELETE FROM login_attempts 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- 90일 이상 된 프로젝트 접근 로그 삭제 
    DELETE FROM project_access_logs 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. 코멘트 추가
COMMENT ON TABLE login_attempts IS 'Login attempt tracking for security and rate limiting';
COMMENT ON TABLE security_policies IS 'Project-specific security policy configurations';
COMMENT ON TABLE project_access_logs IS 'Project access logging for monitoring and debugging';

COMMENT ON FUNCTION check_login_attempts IS 'Check if IP/user is locked out due to failed attempts';
COMMENT ON FUNCTION record_login_attempt IS 'Record login attempt with success/failure details';
COMMENT ON FUNCTION cleanup_old_logs IS 'Clean up old security and access logs';

COMMENT ON COLUMN login_attempts.project_code IS 'Project code - may be null for invalid project access';
COMMENT ON COLUMN login_attempts.failure_reason IS 'Reason for login failure (invalid_credentials, account_locked, etc.)';
COMMENT ON COLUMN security_policies.policy_config IS 'JSON configuration for security policy parameters';
COMMENT ON COLUMN project_access_logs.access_result IS 'Result of project access attempt';
COMMENT ON COLUMN project_access_logs.environment IS 'Environment where access occurred (development/production)';