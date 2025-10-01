# 데이터베이스 스키마 설계

## 공통 엔티티 필수 필드

### 모든 테이블 공통 컬럼
```sql
-- 모든 테이블에 반드시 포함되어야 하는 컬럼들
tenant_id UUID NOT NULL,           -- 멀티테넌트 식별자
project_code VARCHAR(50),          -- 프로젝트 코드 (선택적)
created_at TIMESTAMP DEFAULT NOW(),
created_by UUID,
updated_at TIMESTAMP DEFAULT NOW(),
updated_by UUID,
deleted_at TIMESTAMP NULL,         -- Soft Delete
version INTEGER DEFAULT 1          -- 낙관적 잠금용
```

## 핵심 엔티티 정의

### 1. 테넌트 관리
```sql
-- 테넌트 (기업/조직)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,  -- 자기 참조
    project_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    domain VARCHAR(255),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    subscription_plan VARCHAR(50) DEFAULT 'BASIC',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. 사용자 관리
```sql
-- 사용자
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    global_login_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    name VARCHAR(100) NOT NULL,
    preferred_lang VARCHAR(5) DEFAULT 'ko',
    password_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- 사용자-테넌트 매핑 (멀티 소속 지원)
CREATE TABLE user_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    roles JSONB DEFAULT '[]',
    permissions JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'ACTIVE',
    joined_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE(user_id, tenant_id)
);
```

### 3. 프로젝트 관리
```sql
-- 프로젝트
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'PLANNING',
    template_id UUID,
    start_date DATE,
    end_date DATE,
    manager_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (manager_id) REFERENCES users(id),
    UNIQUE(tenant_id, name)
);
```

### 4. 파일/문서 관리
```sql
-- 파일/문서
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    project_id UUID,
    name VARCHAR(255) NOT NULL,
    path VARCHAR(1000) NOT NULL,
    size BIGINT,
    mime_type VARCHAR(100),
    checksum VARCHAR(64),
    version INTEGER DEFAULT 1,
    meta_json JSONB DEFAULT '{}',
    acl_json JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

## 인덱스 전략

### 1. 필수 복합 인덱스
```sql
-- 모든 테이블에 적용되는 기본 인덱스
CREATE INDEX idx_users_tenant_id ON users (tenant_id, id);
CREATE INDEX idx_projects_tenant_id ON projects (tenant_id, id);
CREATE INDEX idx_documents_tenant_id ON documents (tenant_id, project_id, id);

-- 검색 최적화 인덱스
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_global_login ON users (global_login_id);
CREATE INDEX idx_tenants_project_code ON tenants (project_code);
```

### 2. 파티셔닝 대상 테이블
```sql
-- 감사 로그 (월별 파티셔닝)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    project_code VARCHAR(50),
    actor_id UUID,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id UUID,
    payload JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 사용량 통계 (월별 파티셔닝)
CREATE TABLE usage_monthly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    period VARCHAR(7) NOT NULL, -- YYYY-MM
    users_peak INTEGER DEFAULT 0,
    storage_peak_gb DECIMAL(10,2) DEFAULT 0,
    api_calls BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, period)
) PARTITION BY RANGE (created_at);
```