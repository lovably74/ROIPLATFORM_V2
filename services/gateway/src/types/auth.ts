export interface User {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  tenantId?: string;
  projectCodes?: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JWTPayload {
  sub: string; // user id
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  tenantId?: string;
  projectCodes?: string[];
  iat: number; // issued at
  exp: number; // expires at
  iss: string; // issuer
  aud: string; // audience
}

export interface AuthenticationResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface AuthorizationResult {
  allowed: boolean;
  user: User;
  requiredPermissions?: string[];
  missingPermissions?: string[];
  error?: string;
}

export enum AuthErrorCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  MISSING_TOKEN = 'MISSING_TOKEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  USER_INACTIVE = 'USER_INACTIVE',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  PROJECT_ACCESS_DENIED = 'PROJECT_ACCESS_DENIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

export enum AuthMethod {
  JWT = 'jwt',
  SESSION = 'session',
  API_KEY = 'api_key',
  SSO_TOKEN = 'sso_token',
  BASIC_AUTH = 'basic_auth'
}

export interface AuthConfig {
  jwt: JWTConfig;
  session: SessionConfig;
  apiKey: ApiKeyConfig;
  sso: SSOConfig;
  rateLimiting: RateLimitingConfig;
  security: SecurityConfig;
}

export interface JWTConfig {
  secret: string;
  publicKey?: string;
  privateKey?: string;
  algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
  enableRefreshToken: boolean;
  blacklistStrategy: 'redis' | 'memory' | 'none';
}

export interface SessionConfig {
  secret: string;
  name: string;
  cookie: {
    domain?: string;
    path: string;
    maxAge: number;
    secure: boolean;
    httpOnly: boolean;
    sameSite: 'strict' | 'lax' | 'none';
  };
  store: 'redis' | 'memory';
  resave: boolean;
  saveUninitialized: boolean;
}

export interface ApiKeyConfig {
  headerName: string;
  queryParamName?: string;
  validateFormat: boolean;
  keyPattern?: RegExp;
  enableRotation: boolean;
  rotationPeriod: number;
  storage: 'redis' | 'database';
}

export interface SSOConfig {
  providers: SSOProvider[];
  defaultProvider?: string;
  enableMultipleProviders: boolean;
  tokenValidationEndpoint?: string;
  userInfoEndpoint?: string;
}

export interface SSOProvider {
  name: string;
  type: 'oauth2' | 'saml' | 'oidc';
  clientId: string;
  clientSecret: string;
  authorizationURL: string;
  tokenURL: string;
  userInfoURL?: string;
  scope: string[];
  callbackURL: string;
  enabled: boolean;
}

export interface RateLimitingConfig {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  keyGenerator?: 'ip' | 'user' | 'custom';
  customKeyGenerator?: (req: any) => string;
  store: 'redis' | 'memory';
}

export interface SecurityConfig {
  enableCSRF: boolean;
  csrfSecret: string;
  allowedOrigins: string[];
  maxRequestSize: string;
  enableRequestSigning: boolean;
  signingSecret?: string;
  trustProxy: boolean;
  enableAuditLogging: boolean;
}

export interface ApiKey {
  id: string;
  key: string;
  hashedKey: string;
  name: string;
  userId?: string;
  tenantId?: string;
  projectCodes?: string[];
  permissions: string[];
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  hashedToken: string;
  expiresAt: Date;
  isRevoked: boolean;
  deviceInfo?: {
    userAgent: string;
    ip: string;
    deviceId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  id: string;
  userId: string;
  tenantId?: string;
  projectCodes?: string[];
  data: Record<string, any>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  tenantId?: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthContext {
  user: User;
  method: AuthMethod;
  token?: string;
  session?: AuthSession;
  apiKey?: ApiKey;
  permissions: string[];
  tenantId?: string;
  projectCodes?: string[];
  requestId: string;
  ip: string;
  userAgent: string;
}

export interface TokenBlacklist {
  token: string;
  userId: string;
  expiresAt: Date;
  reason: 'logout' | 'revoked' | 'security';
  createdAt: Date;
}

export interface AuditLog {
  id: string;
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
  tenantId?: string;
  timestamp: Date;
  details?: Record<string, any>;
}