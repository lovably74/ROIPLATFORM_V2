export interface TenantContext {
  tenantId: string;
  projectCode?: string;
  subdomain?: string;
  organizationId?: string;
  region?: string;
  environment?: string;
  tier?: 'free' | 'basic' | 'premium' | 'enterprise';
  features: string[];
  quotas: TenantQuotas;
  metadata: Record<string, any>;
}

export interface TenantQuotas {
  maxUsers: number;
  maxProjects: number;
  maxApiCalls: number;
  maxStorage: number; // bytes
  rateLimit: {
    requests: number;
    windowMs: number;
  };
}

export interface Tenant {
  id: string;
  name: string;
  displayName: string;
  subdomain?: string;
  organizationId?: string;
  parentTenantId?: string; // 계층적 테넌트
  status: 'active' | 'suspended' | 'deleted';
  tier: 'free' | 'basic' | 'premium' | 'enterprise';
  region: string;
  environment: 'development' | 'staging' | 'production';
  settings: TenantSettings;
  quotas: TenantQuotas;
  features: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  allowMultipleProjects: boolean;
  enableAuditLogging: boolean;
  enableEncryption: boolean;
  dataRetentionDays: number;
  timezone: string;
  locale: string;
  customDomain?: string;
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
}

export interface Project {
  id: string;
  code: string; // unique within tenant
  name: string;
  description?: string;
  tenantId: string;
  status: 'active' | 'archived' | 'deleted';
  settings: ProjectSettings;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSettings {
  enableVersioning: boolean;
  defaultEnvironment: string;
  allowedEnvironments: string[];
  apiPrefix?: string;
  customSettings: Record<string, any>;
}

export interface TenantResolutionStrategy {
  type: 'header' | 'subdomain' | 'path' | 'jwt' | 'custom';
  priority: number;
  config: Record<string, any>;
  enabled: boolean;
}

export interface TenantResolutionConfig {
  strategies: TenantResolutionStrategy[];
  fallbackTenantId?: string;
  enableCaching: boolean;
  cacheTimeout: number;
  strictMode: boolean; // false = allow requests without tenant
}

export interface TenantResolutionResult {
  success: boolean;
  tenantId?: string;
  projectCode?: string;
  strategy?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export interface TenantInjectionOptions {
  headerNames: {
    tenantId: string;
    projectCode: string;
    organizationId: string;
  };
  enableValidation: boolean;
  enableCaching: boolean;
  cacheTimeout: number;
  enableMetrics: boolean;
  onTenantResolved?: (context: TenantContext) => void;
  onTenantNotFound?: (tenantId: string) => void;
}

export interface TenantMetrics {
  totalRequests: number;
  requestsByTenant: Record<string, number>;
  requestsByProject: Record<string, number>;
  cacheHitRate: number;
  averageResolutionTime: number;
  failedResolutions: number;
}

export interface TenantCache {
  tenant: Tenant;
  context: TenantContext;
  projects: Project[];
  cachedAt: Date;
  expiresAt: Date;
}

export interface TenantValidationResult {
  valid: boolean;
  tenant?: Tenant;
  project?: Project;
  context?: TenantContext;
  error?: string;
  errorCode?: TenantErrorCode;
}

export enum TenantErrorCode {
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  TENANT_DELETED = 'TENANT_DELETED',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_ARCHIVED = 'PROJECT_ARCHIVED',
  INVALID_SUBDOMAIN = 'INVALID_SUBDOMAIN',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  REGION_MISMATCH = 'REGION_MISMATCH',
  FEATURE_NOT_AVAILABLE = 'FEATURE_NOT_AVAILABLE'
}

// Express Request 확장
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      tenantId?: string;
      projectCode?: string;
    }
  }
}

export interface TenantAuditLog {
  id: string;
  tenantId: string;
  projectCode?: string;
  userId?: string;
  action: string;
  resource: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  success: boolean;
  errorCode?: string;
  requestId: string;
  responseTime: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}