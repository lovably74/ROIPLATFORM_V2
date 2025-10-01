-- CISP 초기 데이터베이스 스키마
-- 생성일: 2025-10-01
-- 버전: 1.0.0

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 테넌트 (기업/조직) 테이블
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL, -- 자기 참조
    project_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    domain VARCHAR(255),
    logo_url VARCHAR(500),
    theme_config JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    subscription_plan VARCHAR(50) DEFAULT 'BASIC',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID,
    deleted_at TIMESTAMP NULL,
    version INTEGER DEFAULT 1
);

-- 테넌트 인덱스
CREATE INDEX idx_tenants_tenant_id ON tenants (tenant_id);
CREATE INDEX idx_tenants_project_code ON tenants (project_code);
CREATE INDEX idx_tenants_status ON tenants (status);
CREATE INDEX idx_tenants_created_at ON tenants (created_at);

-- 사용자 테이블
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    global_login_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    preferred_lang VARCHAR(5) DEFAULT 'ko',
    timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
    password_hash VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    email_verified_at TIMESTAMP,
    phone_verified_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED')),
    last_login_at TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    profile JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID,
    deleted_at TIMESTAMP NULL,
    version INTEGER DEFAULT 1,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 사용자 인덱스
CREATE INDEX idx_users_tenant_id ON users (tenant_id, id);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_global_login ON users (global_login_id);
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_last_login ON users (last_login_at);

-- 사용자-테넌트 매핑 (멀티 소속 지원)
CREATE TABLE user_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    roles JSONB DEFAULT '[]',
    permissions JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING')),
    invited_by UUID,
    invited_at TIMESTAMP,
    joined_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(user_id, tenant_id)
);

-- 사용자-테넌트 인덱스
CREATE INDEX idx_user_tenants_user_id ON user_tenants (user_id);
CREATE INDEX idx_user_tenants_tenant_id ON user_tenants (tenant_id);
CREATE INDEX idx_user_tenants_status ON user_tenants (status);

-- 프로젝트 테이블
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    status VARCHAR(20) DEFAULT 'PLANNING' CHECK (status IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    template_id UUID,
    manager_id UUID,
    client_info JSONB DEFAULT '{}',
    location JSONB DEFAULT '{}',
    start_date DATE,
    end_date DATE,
    budget DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'KRW',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID,
    deleted_at TIMESTAMP NULL,
    version INTEGER DEFAULT 1,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, code)
);

-- 프로젝트 인덱스
CREATE INDEX idx_projects_tenant_id ON projects (tenant_id, id);
CREATE INDEX idx_projects_status ON projects (status);
CREATE INDEX idx_projects_manager ON projects (manager_id);
CREATE INDEX idx_projects_dates ON projects (start_date, end_date);

-- 파일/문서 테이블
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    project_id UUID,
    parent_id UUID,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    path VARCHAR(1000) NOT NULL,
    url VARCHAR(1000),
    size BIGINT,
    mime_type VARCHAR(100),
    extension VARCHAR(10),
    checksum VARCHAR(64),
    version INTEGER DEFAULT 1,
    is_folder BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,
    download_count INTEGER DEFAULT 0,
    tags TEXT[],
    meta_json JSONB DEFAULT '{}',
    acl_json JSONB DEFAULT '{}',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 문서 인덱스
CREATE INDEX idx_documents_tenant_id ON documents (tenant_id, project_id, id);
CREATE INDEX idx_documents_parent ON documents (parent_id);
CREATE INDEX idx_documents_created_by ON documents (created_by);
CREATE INDEX idx_documents_mime_type ON documents (mime_type);
CREATE INDEX idx_documents_tags ON documents USING GIN (tags);

-- 감사 로그 테이블 (월별 파티셔닝)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    project_code VARCHAR(50),
    actor_id UUID,
    actor_type VARCHAR(50) DEFAULT 'USER',
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    target_type VARCHAR(100),
    target_id UUID,
    result VARCHAR(20) DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS', 'FAILURE', 'PENDING')),
    payload JSONB,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
) PARTITION BY RANGE (created_at);

-- 감사 로그 인덱스 (파티션 테이블에는 기본 인덱스만)
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs (tenant_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);

-- 월별 파티션 테이블 생성 (향후 자동화)
CREATE TABLE audit_logs_202510 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

-- 사용량 통계 테이블 (월별 파티셔닝)
CREATE TABLE usage_monthly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    period VARCHAR(7) NOT NULL, -- YYYY-MM
    users_peak INTEGER DEFAULT 0,
    users_active INTEGER DEFAULT 0,
    storage_peak_gb DECIMAL(10,2) DEFAULT 0,
    storage_current_gb DECIMAL(10,2) DEFAULT 0,
    api_calls BIGINT DEFAULT 0,
    bandwidth_gb DECIMAL(10,2) DEFAULT 0,
    documents_count INTEGER DEFAULT 0,
    projects_count INTEGER DEFAULT 0,
    login_count INTEGER DEFAULT 0,
    feature_usage JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, period),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) PARTITION BY RANGE (created_at);

-- 사용량 통계 인덱스
CREATE INDEX idx_usage_monthly_tenant_period ON usage_monthly (tenant_id, period);

-- 월별 파티션 테이블 생성
CREATE TABLE usage_monthly_202510 PARTITION OF usage_monthly
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

-- 자동 파티션 생성을 위한 함수 (향후 확장)
CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS void AS $$
DECLARE
    start_date date;
    end_date date;
    table_name text;
BEGIN
    -- 다음 달 파티션 생성
    start_date := date_trunc('month', CURRENT_DATE + INTERVAL '1 month');
    end_date := start_date + INTERVAL '1 month';
    
    -- 감사 로그 파티션
    table_name := 'audit_logs_' || to_char(start_date, 'YYYYMM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
                   table_name, start_date, end_date);
    
    -- 사용량 통계 파티션
    table_name := 'usage_monthly_' || to_char(start_date, 'YYYYMM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF usage_monthly FOR VALUES FROM (%L) TO (%L)',
                   table_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;

-- 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_tenants_updated_at BEFORE UPDATE ON user_tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_usage_monthly_updated_at BEFORE UPDATE ON usage_monthly FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();