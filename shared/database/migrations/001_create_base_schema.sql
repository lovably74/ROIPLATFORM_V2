-- ROIPLATFORM 멀티테넌트 기본 스키마
-- 작성일: 2025-09-30
-- 설명: 멀티테넌트 아키텍처를 위한 핵심 테이블 생성

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 사용자 테이블 (전역 사용자)
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    global_login_id VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    name VARCHAR(100) NOT NULL,
    preferred_lang VARCHAR(10) DEFAULT 'ko',
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

-- 2. 테넌트 테이블 (기업/조직)
CREATE TABLE tenants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    business_type VARCHAR(50), -- corporation, individual, government
    tax_number VARCHAR(50),
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    country VARCHAR(50) DEFAULT 'KR',
    timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
    locale VARCHAR(10) DEFAULT 'ko',
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
    subscription_plan VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMPTZ NULL,
    
    CONSTRAINT unique_tenant_name UNIQUE (name)
);

-- 3. 사용자-테넌트 관계 테이블 (멀티 소속 지원)
CREATE TABLE user_tenants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    roles JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, pending
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_user_tenant UNIQUE (user_id, tenant_id)
);

-- 4. 모듈 테이블 (기능 정의)
CREATE TABLE modules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    i18n_key VARCHAR(100) NOT NULL,
    description TEXT,
    billable BOOLEAN DEFAULT true,
    category VARCHAR(50), -- pmis, epms, erp, common
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. 가격책 테이블 (테넌트별 모듈 가격)
CREATE TABLE price_books (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    module_id UUID NOT NULL REFERENCES modules(id),
    base_price DECIMAL(12,4) DEFAULT 0,
    price_per_user DECIMAL(12,4) DEFAULT 0,
    price_per_gb DECIMAL(12,4) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'KRW',
    effective_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_tenant_module_price UNIQUE (tenant_id, module_id, effective_at)
);

-- 6. 구독 테이블
CREATE TABLE subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    cycle VARCHAR(20) NOT NULL, -- MONTHLY, YEARLY
    status VARCHAR(20) DEFAULT 'active', -- active, cancelled, suspended
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMPTZ NULL,
    auto_renewal BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_subscription_cycle CHECK (cycle IN ('MONTHLY', 'YEARLY'))
);

-- 7. 월별 사용량 테이블
CREATE TABLE usage_monthly (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    year_month VARCHAR(7) NOT NULL, -- YYYY-MM
    users_peak INTEGER DEFAULT 0,
    storage_peak_gb DECIMAL(12,4) DEFAULT 0,
    api_calls BIGINT DEFAULT 0,
    documents_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_tenant_month UNIQUE (tenant_id, year_month)
);

-- 8. 인보이스 테이블
CREATE TABLE invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    amount DECIMAL(12,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KRW',
    status VARCHAR(20) DEFAULT 'draft', -- draft, issued, paid, overdue, cancelled
    issued_at TIMESTAMPTZ NULL,
    due_at TIMESTAMPTZ NULL,
    paid_at TIMESTAMPTZ NULL,
    pdf_url TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. 프로젝트 테이블 (테넌트 스코프)
CREATE TABLE projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    status VARCHAR(20) DEFAULT 'planning', -- planning, active, on_hold, completed, cancelled
    template_id UUID NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    budget_amount DECIMAL(15,4) NULL,
    currency VARCHAR(3) DEFAULT 'KRW',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMPTZ NULL,
    
    CONSTRAINT unique_tenant_project_name UNIQUE (tenant_id, name),
    CONSTRAINT unique_tenant_project_code UNIQUE (tenant_id, code)
);

-- 10. 감사 로그 테이블 (월별 파티션 준비)
CREATE TABLE audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NULL,
    payload JSONB NULL,
    ip_address INET NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성 (멀티테넌트 최적화)
CREATE INDEX idx_user_tenants_user_id ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant_id ON user_tenants(tenant_id);
CREATE INDEX idx_price_books_tenant_module ON price_books(tenant_id, module_id);
CREATE INDEX idx_usage_monthly_tenant_month ON usage_monthly(tenant_id, year_month);
CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX idx_projects_status ON projects(tenant_id, status);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at);

-- Row Level Security (RLS) 정책 설정
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 기본 RLS 정책 (각 서비스에서 더 세밀하게 구성)
-- 예시: 테넌트는 자신의 데이터만 접근 가능
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_audit ON audit_logs
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

COMMENT ON TABLE users IS 'Global users table';
COMMENT ON TABLE tenants IS 'Tenants (organizations) table';
COMMENT ON TABLE user_tenants IS 'User-tenant relationship table (multi-tenancy)';
COMMENT ON TABLE modules IS 'System modules/features definition';
COMMENT ON TABLE price_books IS 'Tenant-specific module pricing';
COMMENT ON TABLE subscriptions IS 'Tenant subscription information';
COMMENT ON TABLE usage_monthly IS 'Tenant monthly usage statistics';
COMMENT ON TABLE invoices IS 'Invoices and billing';
COMMENT ON TABLE projects IS 'Project information (tenant-scoped)';
COMMENT ON TABLE audit_logs IS 'Audit logs (monthly partition planned)';
