-- =====================================================
-- ROIPLATFORM V2 인증 서비스 데이터베이스 스키마
-- 
-- 멀티테넌트 지원 및 RBAC 기반 인증/인가 시스템
-- 작성일: 2025-09-30
-- =====================================================

-- 확장 모듈 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. 테넌트 관리
-- =====================================================

-- 테넌트 테이블
CREATE TABLE tenants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    
    -- 테넌트 설정
    max_users INTEGER DEFAULT 100,
    subscription_plan VARCHAR(50) DEFAULT 'BASIC',
    features JSONB DEFAULT '{}',
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID,
    updated_by UUID,
    
    -- 제약조건
    CONSTRAINT chk_tenant_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    CONSTRAINT chk_tenant_plan CHECK (subscription_plan IN ('BASIC', 'PREMIUM', 'ENTERPRISE'))
);

-- 테넌트 인덱스
CREATE INDEX idx_tenants_name ON tenants(name);
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_status ON tenants(status);

-- =====================================================
-- 2. 사용자 관리
-- =====================================================

-- 사용자 테이블
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- 기본 정보
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- 개인 정보
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone_number VARCHAR(50),
    
    -- 상태 관리
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    
    -- 보안 설정
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    
    -- 로그인 관리
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- 비밀번호 관리
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    password_expires_at TIMESTAMP WITH TIME ZONE,
    temp_password BOOLEAN DEFAULT FALSE,
    
    -- 프로필 정보
    avatar_url VARCHAR(500),
    locale VARCHAR(10) DEFAULT 'ko-KR',
    timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- 제약조건
    CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING_VERIFICATION')),
    UNIQUE(tenant_id, username),
    UNIQUE(tenant_id, email)
);

-- 사용자 인덱스
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_username ON users(tenant_id, username);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_last_login ON users(last_login_at);
CREATE UNIQUE INDEX idx_users_active_username ON users(tenant_id, username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_active_email ON users(tenant_id, email) WHERE deleted_at IS NULL;

-- =====================================================
-- 3. 역할 및 권한 관리 (RBAC)
-- =====================================================

-- 역할 테이블
CREATE TABLE roles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- 역할 정보
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 역할 타입
    type VARCHAR(50) NOT NULL DEFAULT 'CUSTOM',
    is_system BOOLEAN DEFAULT FALSE,
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID,
    updated_by UUID,
    
    -- 제약조건
    CONSTRAINT chk_role_type CHECK (type IN ('SYSTEM', 'TENANT_ADMIN', 'CUSTOM')),
    UNIQUE(tenant_id, name)
);

-- 권한 테이블
CREATE TABLE permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- 권한 정보
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 권한 분류
    module VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 역할-권한 매핑 테이블
CREATE TABLE role_permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID,
    
    -- 제약조건
    UNIQUE(role_id, permission_id)
);

-- 사용자-역할 매핑 테이블
CREATE TABLE user_roles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    
    -- 유효 기간
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID,
    
    -- 제약조건
    UNIQUE(user_id, role_id)
);

-- 역할 및 권한 인덱스
CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);
CREATE INDEX idx_roles_name ON roles(tenant_id, name);
CREATE INDEX idx_roles_type ON roles(type);
CREATE INDEX idx_permissions_module ON permissions(module);
CREATE INDEX idx_permissions_resource ON permissions(resource, action);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- =====================================================
-- 4. 인증 토큰 관리
-- =====================================================

-- 리프레시 토큰 테이블
CREATE TABLE refresh_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 토큰 정보
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_info JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    
    -- 만료 관리
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- 리프레시 토큰 인덱스
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- =====================================================
-- 5. 보안 감사 및 로그
-- =====================================================

-- 로그인 시도 기록
CREATE TABLE login_attempts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- 시도 정보
    username VARCHAR(100),
    email VARCHAR(255),
    tenant_id UUID REFERENCES tenants(id),
    
    -- 결과 정보
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(255),
    
    -- 요청 정보
    ip_address INET NOT NULL,
    user_agent TEXT,
    device_info JSONB DEFAULT '{}',
    
    -- 메타데이터
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 사용자 활동 로그
CREATE TABLE user_activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- 활동 정보
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    
    -- 요청 정보
    ip_address INET,
    user_agent TEXT,
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 보안 로그 인덱스
CREATE INDEX idx_login_attempts_username ON login_attempts(username, attempted_at);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, attempted_at);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, attempted_at);
CREATE INDEX idx_login_attempts_success ON login_attempts(success, attempted_at);
CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id, created_at);
CREATE INDEX idx_user_activity_logs_tenant_id ON user_activity_logs(tenant_id, created_at);
CREATE INDEX idx_user_activity_logs_action ON user_activity_logs(action, created_at);

-- =====================================================
-- 6. 트리거 및 함수
-- =====================================================

-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- updated_at 트리거 생성
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. 초기 데이터 설정
-- =====================================================

-- 시스템 테넌트 생성 (플랫폼 관리용)
INSERT INTO tenants (id, name, display_name, status, subscription_plan, max_users)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system',
    'System Tenant',
    'ACTIVE',
    'ENTERPRISE',
    999999
);

-- 기본 권한 생성
INSERT INTO permissions (name, display_name, description, module, resource, action) VALUES
-- 사용자 관리
('USER_READ', '사용자 조회', '사용자 정보를 조회할 수 있습니다.', 'USER', 'user', 'read'),
('USER_CREATE', '사용자 생성', '새로운 사용자를 생성할 수 있습니다.', 'USER', 'user', 'create'),
('USER_UPDATE', '사용자 수정', '사용자 정보를 수정할 수 있습니다.', 'USER', 'user', 'update'),
('USER_DELETE', '사용자 삭제', '사용자를 삭제할 수 있습니다.', 'USER', 'user', 'delete'),

-- 역할 관리
('ROLE_READ', '역할 조회', '역할 정보를 조회할 수 있습니다.', 'AUTH', 'role', 'read'),
('ROLE_CREATE', '역할 생성', '새로운 역할을 생성할 수 있습니다.', 'AUTH', 'role', 'create'),
('ROLE_UPDATE', '역할 수정', '역할 정보를 수정할 수 있습니다.', 'AUTH', 'role', 'update'),
('ROLE_DELETE', '역할 삭제', '역할을 삭제할 수 있습니다.', 'AUTH', 'role', 'delete'),

-- 테넌트 관리
('TENANT_READ', '테넌트 조회', '테넌트 정보를 조회할 수 있습니다.', 'TENANT', 'tenant', 'read'),
('TENANT_CREATE', '테넌트 생성', '새로운 테넌트를 생성할 수 있습니다.', 'TENANT', 'tenant', 'create'),
('TENANT_UPDATE', '테넌트 수정', '테넌트 정보를 수정할 수 있습니다.', 'TENANT', 'tenant', 'update'),
('TENANT_DELETE', '테넌트 삭제', '테넌트를 삭제할 수 있습니다.', 'TENANT', 'tenant', 'delete'),

-- 시스템 관리
('SYSTEM_ADMIN', '시스템 관리', '모든 시스템 기능에 접근할 수 있습니다.', 'SYSTEM', 'all', 'all');

-- 시스템 역할 생성
INSERT INTO roles (id, tenant_id, name, display_name, description, type, is_system) VALUES
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM_ADMIN', '시스템 관리자', '모든 시스템 권한을 가진 최고 관리자', 'SYSTEM', true),
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'TENANT_ADMIN', '테넌트 관리자', '테넌트 내 모든 권한을 가진 관리자', 'TENANT_ADMIN', true),
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'USER', '일반 사용자', '기본 사용자 권한', 'CUSTOM', true);

-- 시스템 관리자 역할에 모든 권한 부여
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM permissions;

-- 테넌트 관리자 역할에 테넌트 관련 권한 부여
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id FROM permissions 
WHERE name IN ('USER_READ', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'ROLE_READ', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE');

-- 일반 사용자 역할에 기본 권한 부여
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id FROM permissions 
WHERE name IN ('USER_READ');

COMMENT ON TABLE tenants IS '멀티테넌트 시스템을 위한 테넌트 정보';
COMMENT ON TABLE users IS '테넌트별 사용자 계정 정보';
COMMENT ON TABLE roles IS 'RBAC 시스템의 역할 정의';
COMMENT ON TABLE permissions IS 'RBAC 시스템의 권한 정의';
COMMENT ON TABLE user_roles IS '사용자-역할 매핑';
COMMENT ON TABLE role_permissions IS '역할-권한 매핑';
COMMENT ON TABLE refresh_tokens IS 'JWT 리프레시 토큰 관리';
COMMENT ON TABLE login_attempts IS '로그인 시도 기록 및 보안 감사';
COMMENT ON TABLE user_activity_logs IS '사용자 활동 로그 및 감사 추적';