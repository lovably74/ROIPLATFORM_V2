-- ROIPLATFORM KISA 가이드라인 및 웹 접근성 준수를 위한 추가 스키마
-- 작성일: 2025-09-30
-- 설명: 보안 컴플라이언스, 웹 접근성, 감사 추적을 위한 테이블

-- 1. 보안 컴플라이언스 체크리스트 테이블
CREATE TABLE security_compliance_checks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    check_category VARCHAR(50) NOT NULL, -- kisa_secure_dev, kisa_vuln_scan, zero_trust, etc.
    check_item_code VARCHAR(100) NOT NULL,
    check_title VARCHAR(200) NOT NULL,
    check_description TEXT,
    severity VARCHAR(20) DEFAULT 'medium', -- critical, high, medium, low
    compliance_standard VARCHAR(50), -- KISA, ISMS-P, ISO27001, etc.
    auto_checkable BOOLEAN DEFAULT false,
    check_query TEXT, -- SQL query for automated checks
    remediation_guide TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_compliance_check UNIQUE (check_category, check_item_code)
);

-- 2. 프로젝트별 컴플라이언스 상태 테이블
CREATE TABLE project_compliance_status (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL REFERENCES projects(project_code) ON DELETE CASCADE,
    check_id UUID NOT NULL REFERENCES security_compliance_checks(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- compliant, non_compliant, pending, not_applicable
    last_checked_at TIMESTAMPTZ,
    checked_by UUID REFERENCES users(id),
    evidence_text TEXT,
    evidence_file_url TEXT,
    remediation_status VARCHAR(20) DEFAULT 'not_started', -- not_started, in_progress, completed
    remediation_due_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_project_compliance UNIQUE (project_code, check_id)
);

-- 3. 웹 접근성 체크리스트 테이블 (KWCAG 2.2)
CREATE TABLE accessibility_guidelines (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    guideline_code VARCHAR(20) NOT NULL UNIQUE, -- 1.1.1, 1.1.2, 2.1.1, etc.
    guideline_title VARCHAR(200) NOT NULL,
    guideline_category VARCHAR(50) NOT NULL, -- perceivable, operable, understandable, robust
    level VARCHAR(10) NOT NULL, -- A, AA, AAA
    description TEXT,
    success_criteria TEXT,
    test_method TEXT,
    automated_test_possible BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. 프로젝트별 접근성 준수 상태 테이블
CREATE TABLE project_accessibility_status (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL REFERENCES projects(project_code) ON DELETE CASCADE,
    guideline_id UUID NOT NULL REFERENCES accessibility_guidelines(id) ON DELETE CASCADE,
    page_url VARCHAR(500),
    element_selector VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pass, fail, pending, not_applicable
    test_method VARCHAR(50), -- automated, manual, user_testing
    tested_at TIMESTAMPTZ,
    tested_by UUID REFERENCES users(id),
    test_result_details JSONB DEFAULT '{}',
    remediation_notes TEXT,
    remediation_status VARCHAR(20) DEFAULT 'not_started',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_project_accessibility UNIQUE (project_code, guideline_id, page_url, element_selector)
);

-- 5. 사용자 접근성 피드백 테이블
CREATE TABLE accessibility_feedback (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL REFERENCES projects(project_code) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    feedback_type VARCHAR(50) NOT NULL, -- improvement_request, bug_report, general_feedback
    page_url VARCHAR(500),
    accessibility_issue TEXT NOT NULL,
    user_agent TEXT,
    assistive_technology VARCHAR(100), -- screen_reader, voice_control, etc.
    severity VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'open', -- open, in_progress, resolved, closed
    assigned_to UUID REFERENCES users(id),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. 보안 감사 로그 테이블 (상세 추적)
CREATE TABLE security_audit_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) REFERENCES projects(project_code) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- auth_failure, privilege_escalation, data_access, config_change
    event_category VARCHAR(50) NOT NULL, -- authentication, authorization, data_protection, system
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    action_attempted VARCHAR(100),
    result VARCHAR(20) NOT NULL, -- success, failure, blocked
    risk_score INTEGER DEFAULT 0, -- 0-100
    threat_indicators JSONB DEFAULT '[]',
    additional_context JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- 파티셔닝을 위한 월별 인덱스
    CONSTRAINT check_risk_score CHECK (risk_score >= 0 AND risk_score <= 100)
) PARTITION BY RANGE (created_at);

-- 7. 컴플라이언스 리포트 생성을 위한 뷰
CREATE OR REPLACE VIEW v_project_compliance_summary AS
SELECT 
    p.project_code,
    p.name as project_name,
    scc.check_category,
    scc.compliance_standard,
    COUNT(*) as total_checks,
    COUNT(CASE WHEN pcs.status = 'compliant' THEN 1 END) as compliant_count,
    COUNT(CASE WHEN pcs.status = 'non_compliant' THEN 1 END) as non_compliant_count,
    COUNT(CASE WHEN pcs.status = 'pending' THEN 1 END) as pending_count,
    ROUND(
        (COUNT(CASE WHEN pcs.status = 'compliant' THEN 1 END)::NUMERIC / 
         NULLIF(COUNT(CASE WHEN pcs.status IN ('compliant', 'non_compliant') THEN 1 END), 0)) * 100, 
        2
    ) as compliance_rate
FROM projects p
LEFT JOIN project_compliance_status pcs ON p.project_code = pcs.project_code
LEFT JOIN security_compliance_checks scc ON pcs.check_id = scc.id
GROUP BY p.project_code, p.name, scc.check_category, scc.compliance_standard;

-- 8. 접근성 준수율 요약 뷰
CREATE OR REPLACE VIEW v_project_accessibility_summary AS
SELECT 
    p.project_code,
    p.name as project_name,
    ag.guideline_category,
    ag.level,
    COUNT(*) as total_guidelines,
    COUNT(CASE WHEN pas.status = 'pass' THEN 1 END) as pass_count,
    COUNT(CASE WHEN pas.status = 'fail' THEN 1 END) as fail_count,
    COUNT(CASE WHEN pas.status = 'pending' THEN 1 END) as pending_count,
    ROUND(
        (COUNT(CASE WHEN pas.status = 'pass' THEN 1 END)::NUMERIC / 
         NULLIF(COUNT(CASE WHEN pas.status IN ('pass', 'fail') THEN 1 END), 0)) * 100, 
        2
    ) as accessibility_rate
FROM projects p
LEFT JOIN project_accessibility_status pas ON p.project_code = pas.project_code
LEFT JOIN accessibility_guidelines ag ON pas.guideline_id = ag.id
GROUP BY p.project_code, p.name, ag.guideline_category, ag.level;

-- 9. 인덱스 생성
CREATE INDEX idx_security_compliance_checks_category ON security_compliance_checks(check_category);
CREATE INDEX idx_security_compliance_checks_standard ON security_compliance_checks(compliance_standard);
CREATE INDEX idx_security_compliance_checks_severity ON security_compliance_checks(severity);

CREATE INDEX idx_project_compliance_status_project ON project_compliance_status(project_code);
CREATE INDEX idx_project_compliance_status_status ON project_compliance_status(status);
CREATE INDEX idx_project_compliance_status_checked ON project_compliance_status(last_checked_at);

CREATE INDEX idx_accessibility_guidelines_category ON accessibility_guidelines(guideline_category);
CREATE INDEX idx_accessibility_guidelines_level ON accessibility_guidelines(level);

CREATE INDEX idx_project_accessibility_status_project ON project_accessibility_status(project_code);
CREATE INDEX idx_project_accessibility_status_status ON project_accessibility_status(status);
CREATE INDEX idx_project_accessibility_status_tested ON project_accessibility_status(tested_at);

CREATE INDEX idx_accessibility_feedback_project ON accessibility_feedback(project_code);
CREATE INDEX idx_accessibility_feedback_status ON accessibility_feedback(status);
CREATE INDEX idx_accessibility_feedback_created ON accessibility_feedback(created_at);

CREATE INDEX idx_security_audit_events_project_time ON security_audit_events(project_code, created_at);
CREATE INDEX idx_security_audit_events_user_time ON security_audit_events(user_id, created_at);
CREATE INDEX idx_security_audit_events_type ON security_audit_events(event_type, created_at);
CREATE INDEX idx_security_audit_events_risk ON security_audit_events(risk_score, created_at) WHERE risk_score > 50;

-- 10. 기본 데이터 삽입

-- KISA 보안 개발 가이드 주요 체크리스트
INSERT INTO security_compliance_checks (check_category, check_item_code, check_title, severity, compliance_standard, auto_checkable) VALUES
('kisa_secure_dev', 'INPUT_001', 'SQL 인젝션 방지 구현', 'critical', 'KISA', true),
('kisa_secure_dev', 'INPUT_002', 'XSS 방지 구현', 'critical', 'KISA', true),
('kisa_secure_dev', 'INPUT_003', '업로드 파일 검증', 'high', 'KISA', false),
('kisa_secure_dev', 'AUTH_001', '다단계 인증 구현', 'high', 'KISA', false),
('kisa_secure_dev', 'AUTH_002', '세션 관리 보안', 'high', 'KISA', true),
('kisa_secure_dev', 'AUTH_003', '비밀번호 정책 구현', 'medium', 'KISA', true),
('kisa_secure_dev', 'DATA_001', '중요 데이터 암호화', 'critical', 'KISA', false),
('kisa_secure_dev', 'DATA_002', '개인정보 마스킹', 'high', 'KISA', false),
('zero_trust', 'ZT_001', '모든 접근 요청 검증', 'critical', 'KISA', true),
('zero_trust', 'ZT_002', '최소 권한 원칙 적용', 'high', 'KISA', false),
('zero_trust', 'ZT_003', '지속적 신뢰 검증', 'high', 'KISA', true);

-- KWCAG 2.2 주요 가이드라인
INSERT INTO accessibility_guidelines (guideline_code, guideline_title, guideline_category, level, description) VALUES
('1.1.1', '대체 텍스트', 'perceivable', 'A', '모든 의미 있는 이미지에 적절한 대체 텍스트 제공'),
('1.4.3', '색상 대비 (최소)', 'perceivable', 'AA', '텍스트와 배경 간 4.5:1 이상 대비율 제공'),
('1.4.6', '색상 대비 (향상)', 'perceivable', 'AAA', '텍스트와 배경 간 7:1 이상 대비율 제공'),
('2.1.1', '키보드', 'operable', 'A', '모든 기능을 키보드로 사용 가능'),
('2.1.2', '키보드 트랩 없음', 'operable', 'A', '키보드로 접근한 요소에서 빠져나올 수 있음'),
('2.4.1', '블록 건너뛰기', 'operable', 'A', '반복되는 콘텐츠 블록을 건너뛸 수 있는 방법 제공'),
('3.1.1', '페이지 언어', 'understandable', 'A', 'HTML lang 속성으로 페이지 언어 명시'),
('3.2.1', '포커스', 'understandable', 'A', '포커스 시 예기치 않은 컨텍스트 변경 없음'),
('4.1.1', '구문 분석', 'robust', 'A', '마크업 언어로 구현된 콘텐츠의 구문과 구조가 유효함'),
('4.1.2', '이름, 역할, 값', 'robust', 'A', '사용자 인터페이스 구성요소의 이름, 역할, 값 정보를 보조기술에 제공');

-- 11. RLS 정책 설정
ALTER TABLE security_compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_compliance_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessibility_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_accessibility_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessibility_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_events ENABLE ROW LEVEL SECURITY;

-- 프로젝트별 격리 정책
CREATE POLICY project_isolation_compliance_status ON project_compliance_status
    USING (project_code = current_setting('app.current_project_code', true) OR 
           current_setting('app.user_role', true) = 'PROVIDER_ADMIN');

CREATE POLICY project_isolation_accessibility_status ON project_accessibility_status
    USING (project_code = current_setting('app.current_project_code', true) OR 
           current_setting('app.user_role', true) = 'PROVIDER_ADMIN');

CREATE POLICY project_isolation_accessibility_feedback ON accessibility_feedback
    USING (project_code = current_setting('app.current_project_code', true) OR 
           current_setting('app.user_role', true) = 'PROVIDER_ADMIN');

CREATE POLICY project_isolation_security_audit ON security_audit_events
    USING (project_code = current_setting('app.current_project_code', true) OR 
           current_setting('app.user_role', true) = 'PROVIDER_ADMIN');

-- 12. 유틸리티 함수

-- 컴플라이언스 점수 계산 함수
CREATE OR REPLACE FUNCTION calculate_compliance_score(p_project_code VARCHAR(50), p_standard VARCHAR(50) DEFAULT NULL)
RETURNS TABLE(
    total_checks INTEGER,
    compliant_checks INTEGER,
    compliance_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_checks,
        COUNT(CASE WHEN pcs.status = 'compliant' THEN 1 END)::INTEGER as compliant_checks,
        ROUND(
            (COUNT(CASE WHEN pcs.status = 'compliant' THEN 1 END)::NUMERIC / 
             NULLIF(COUNT(CASE WHEN pcs.status IN ('compliant', 'non_compliant') THEN 1 END), 0)) * 100, 
            2
        ) as compliance_percentage
    FROM project_compliance_status pcs
    JOIN security_compliance_checks scc ON pcs.check_id = scc.id
    WHERE pcs.project_code = p_project_code
    AND (p_standard IS NULL OR scc.compliance_standard = p_standard);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 접근성 점수 계산 함수
CREATE OR REPLACE FUNCTION calculate_accessibility_score(p_project_code VARCHAR(50), p_level VARCHAR(10) DEFAULT NULL)
RETURNS TABLE(
    total_guidelines INTEGER,
    passed_guidelines INTEGER,
    accessibility_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_guidelines,
        COUNT(CASE WHEN pas.status = 'pass' THEN 1 END)::INTEGER as passed_guidelines,
        ROUND(
            (COUNT(CASE WHEN pas.status = 'pass' THEN 1 END)::NUMERIC / 
             NULLIF(COUNT(CASE WHEN pas.status IN ('pass', 'fail') THEN 1 END), 0)) * 100, 
            2
        ) as accessibility_percentage
    FROM project_accessibility_status pas
    JOIN accessibility_guidelines ag ON pas.guideline_id = ag.id
    WHERE pas.project_code = p_project_code
    AND (p_level IS NULL OR ag.level = p_level);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. 코멘트 추가
COMMENT ON TABLE security_compliance_checks IS 'KISA and other security compliance checklist items';
COMMENT ON TABLE project_compliance_status IS 'Project-specific compliance status tracking';
COMMENT ON TABLE accessibility_guidelines IS 'KWCAG 2.2 web accessibility guidelines';
COMMENT ON TABLE project_accessibility_status IS 'Project-specific accessibility compliance status';
COMMENT ON TABLE accessibility_feedback IS 'User feedback on accessibility issues';
COMMENT ON TABLE security_audit_events IS 'Detailed security audit events for compliance';

COMMENT ON FUNCTION calculate_compliance_score IS 'Calculate overall compliance score for a project';
COMMENT ON FUNCTION calculate_accessibility_score IS 'Calculate accessibility compliance score for a project';