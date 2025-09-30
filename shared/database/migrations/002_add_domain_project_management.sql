-- ROIPLATFORM 도메인 기반 멀티테넌시 추가 스키마
-- 작성일: 2025-09-30
-- 설명: 프로젝트 코드, 도메인 관리, 커스터마이징 기능을 위한 추가 테이블

-- 1. 기존 projects 테이블에 project_code 컬럼 추가
ALTER TABLE projects ADD COLUMN project_code VARCHAR(50) UNIQUE NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN dashboard_enabled BOOLEAN DEFAULT true;

-- project_code 컬럼에 대한 제약 조건 추가 (영문자 시작, 4자 이상)
ALTER TABLE projects ADD CONSTRAINT check_project_code_format 
CHECK (project_code ~ '^[a-zA-Z][a-zA-Z0-9]{3,}$');

-- 예약어 체크 제약 조건
ALTER TABLE projects ADD CONSTRAINT check_project_code_not_reserved 
CHECK (project_code NOT IN ('public', 'admin', 'api', 'www', 'mail', 'ftp', 'cdn', 'static', 'assets', 'service'));

-- 2. 프로젝트 도메인 관리 테이블
CREATE TABLE project_domains (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL REFERENCES projects(project_code) ON DELETE CASCADE,
    domain_name VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    ssl_cert_status VARCHAR(20) DEFAULT 'pending', -- pending, issued, expired, error
    verification_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, failed
    verification_token VARCHAR(100),
    verification_method VARCHAR(20) DEFAULT 'dns', -- dns, file
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_project_domain UNIQUE (project_code, domain_name),
    CONSTRAINT unique_primary_domain_per_project 
        EXCLUDE USING btree (project_code WITH =) WHERE (is_primary = true)
);

-- 3. 프로젝트 브랜딩 설정 테이블
CREATE TABLE project_branding (
    project_code VARCHAR(50) PRIMARY KEY REFERENCES projects(project_code) ON DELETE CASCADE,
    logo_url TEXT,
    background_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#1976d2',
    secondary_color VARCHAR(7) DEFAULT '#424242',
    accent_color VARCHAR(7) DEFAULT '#ff4081',
    font_family VARCHAR(100) DEFAULT 'Roboto, sans-serif',
    catchphrase VARCHAR(100),
    favicon_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. 프로젝트 일반 설정 테이블 (JSON 기반 유연한 설정)
CREATE TABLE project_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL REFERENCES projects(project_code) ON DELETE CASCADE,
    setting_category VARCHAR(50) NOT NULL, -- auth, dashboard, notification, etc.
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(20) DEFAULT 'json', -- string, number, boolean, json, array
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_project_setting UNIQUE (project_code, setting_category, setting_key)
);

-- 5. 사용자 세션 관리 테이블 (프로젝트별 격리)
CREATE TABLE user_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_code VARCHAR(50) NOT NULL REFERENCES projects(project_code) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    jwt_token TEXT,
    refresh_token VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET,
    user_agent TEXT,
    last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_user_project_session UNIQUE (user_id, project_code, session_token)
);

-- 6. OAuth provider settings table (per project)
CREATE TABLE oauth_providers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL,
    provider_name VARCHAR(50) NOT NULL, -- google, kakao, naver, facebook, custom
    display_name VARCHAR(100),
    client_id VARCHAR(255),
    client_secret VARCHAR(255), -- encrypted storage required
    enabled BOOLEAN DEFAULT false,
    config_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_project_provider UNIQUE (project_code, provider_name)
);

-- 7. Login page customization table (multi-language support)
CREATE TABLE login_customizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL,
    locale VARCHAR(10) NOT NULL DEFAULT 'ko',
    login_labels_json JSONB DEFAULT '{}', -- login form label customizations
    welcome_message TEXT,
    terms_url TEXT,
    privacy_url TEXT,
    help_url TEXT,
    contact_email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_project_locale UNIQUE (project_code, locale)
);

-- 8. 기존 테이블에 project_code 컬럼 추가
ALTER TABLE user_tenants ADD COLUMN project_code VARCHAR(50);
ALTER TABLE subscriptions ADD COLUMN project_code VARCHAR(50);
ALTER TABLE usage_monthly ADD COLUMN project_code VARCHAR(50);
ALTER TABLE invoices ADD COLUMN project_code VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN project_code VARCHAR(50);

-- 9. 인덱스 생성
CREATE INDEX idx_project_domains_project_code ON project_domains(project_code);
CREATE INDEX idx_project_domains_domain_name ON project_domains(domain_name);
CREATE INDEX idx_project_domains_primary ON project_domains(project_code, is_primary) WHERE is_primary = true;

CREATE INDEX idx_project_settings_project_category ON project_settings(project_code, setting_category);
CREATE INDEX idx_project_settings_key ON project_settings(project_code, setting_key);

CREATE INDEX idx_user_sessions_user_project ON user_sessions(user_id, project_code);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

CREATE INDEX idx_oauth_providers_project ON oauth_providers(project_code);
CREATE INDEX idx_oauth_providers_enabled ON oauth_providers(project_code, enabled) WHERE enabled = true;

CREATE INDEX idx_login_customizations_project_locale ON login_customizations(project_code, locale);

-- 프로젝트별 데이터 조회 최적화 인덱스
CREATE INDEX idx_user_tenants_project ON user_tenants(project_code, user_id);
CREATE INDEX idx_subscriptions_project ON subscriptions(project_code, tenant_id);
CREATE INDEX idx_usage_monthly_project ON usage_monthly(project_code, tenant_id, year_month);
CREATE INDEX idx_invoices_project ON invoices(project_code, tenant_id);
CREATE INDEX idx_audit_logs_project ON audit_logs(project_code, tenant_id, created_at);

-- 10. RLS 정책 업데이트
-- 프로젝트별 데이터 격리 정책
CREATE POLICY project_isolation_domains ON project_domains
    USING (project_code = current_setting('app.current_project_code', true));

CREATE POLICY project_isolation_branding ON project_branding
    USING (project_code = current_setting('app.current_project_code', true));

CREATE POLICY project_isolation_settings ON project_settings
    USING (project_code = current_setting('app.current_project_code', true));

CREATE POLICY project_isolation_sessions ON user_sessions
    USING (project_code = current_setting('app.current_project_code', true));

-- RLS 활성화
ALTER TABLE project_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_customizations ENABLE ROW LEVEL SECURITY;

-- 11. Insert default data (skip for now, will be handled separately)

-- 12. Functions and triggers (skip for now, will be handled separately)

-- 13. Add comments
COMMENT ON TABLE project_domains IS 'Project domain mappings with SSL and verification status';
COMMENT ON TABLE project_branding IS 'Project-specific branding and visual customizations';
COMMENT ON TABLE project_settings IS 'Flexible project configuration storage';
COMMENT ON TABLE user_sessions IS 'Project-isolated user session management';
COMMENT ON TABLE oauth_providers IS 'Project-specific OAuth provider configurations';
COMMENT ON TABLE login_customizations IS 'Multi-language login page customizations';

COMMENT ON COLUMN projects.project_code IS 'Unique project identifier for URL routing (alphanumeric, starts with letter, min 4 chars)';
COMMENT ON COLUMN projects.dashboard_enabled IS 'Whether to show dashboard as landing page after login';
COMMENT ON COLUMN project_domains.is_primary IS 'Primary domain for redirects (only one per project)';
COMMENT ON COLUMN project_domains.verification_status IS 'DNS/file verification status for domain ownership';
COMMENT ON COLUMN user_sessions.project_code IS 'Session isolation by project for multi-project login support';

-- 14. Add foreign key constraints after table creation
ALTER TABLE oauth_providers ADD CONSTRAINT fk_oauth_providers_project_code 
    FOREIGN KEY (project_code) REFERENCES projects(project_code) ON DELETE CASCADE;
    
ALTER TABLE login_customizations ADD CONSTRAINT fk_login_customizations_project_code 
    FOREIGN KEY (project_code) REFERENCES projects(project_code) ON DELETE CASCADE;
