import { Request, Response, NextFunction } from 'express';
import { AuthenticationService } from '../services/AuthenticationService';
import { AuthMethod, AuthContext, AuthErrorCode } from '../types/auth';
import { Logger } from '@shared/common-libs';

// Express Request를 확장하여 인증 정보 추가
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      user?: any;
    }
  }
}

export interface AuthMiddlewareOptions {
  authService: AuthenticationService;
  logger: Logger;
  optional?: boolean; // 선택적 인증 (인증되지 않아도 통과)
  requiredPermissions?: string[]; // 필요한 권한
  allowedMethods?: AuthMethod[]; // 허용된 인증 방법
  skipPaths?: string[]; // 인증을 건너뛸 경로
}

/**
 * 인증 미들웨어 생성
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { authService, logger, optional = false, requiredPermissions = [], allowedMethods, skipPaths = [] } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 인증 건너뛸 경로 확인
      if (shouldSkipAuth(req.path, skipPaths)) {
        return next();
      }

      // 인증 시도
      const authResult = await authService.authenticate(req);

      if (!authResult.success) {
        // 선택적 인증인 경우 실패해도 통과
        if (optional) {
          return next();
        }

        // 인증 실패 응답
        return handleAuthFailure(res, authResult.errorCode, authResult.error);
      }

      if (!authResult.user) {
        return handleAuthFailure(res, AuthErrorCode.INVALID_TOKEN, 'User not found');
      }

      // 허용된 인증 방법 확인
      const authMethod = detectAuthMethod(req);
      if (allowedMethods && authMethod && !allowedMethods.includes(authMethod)) {
        return handleAuthFailure(res, AuthErrorCode.INVALID_TOKEN, 'Authentication method not allowed');
      }

      // 인증 컨텍스트 생성
      const authContext = authService.createAuthContext(
        authResult.user,
        authMethod || AuthMethod.JWT,
        req,
        { token: authResult.token }
      );

      // 권한 확인
      if (requiredPermissions.length > 0) {
        const authzResult = await authService.authorize(authContext, requiredPermissions);
        if (!authzResult.allowed) {
          return handleAuthzFailure(res, authzResult);
        }
      }

      // 요청 객체에 인증 정보 추가
      req.auth = authContext;
      req.user = authResult.user;

      logger.debug('인증 성공', {
        userId: authResult.user.id,
        method: authMethod,
        path: req.path
      });

      next();

    } catch (error) {
      logger.error('인증 미들웨어 오류', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication processing failed'
      });
    }
  };
}

/**
 * 권한 검증 미들웨어 생성
 */
export function requirePermissions(permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const authService = req.app.locals.authService as AuthenticationService;
    if (!authService) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication service not available'
      });
    }

    const authzResult = await authService.authorize(req.auth, permissions);
    if (!authzResult.allowed) {
      return handleAuthzFailure(res, authzResult);
    }

    next();
  };
}

/**
 * 역할 기반 접근 제어 미들웨어
 */
export function requireRoles(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userRoles = req.auth.user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient role privileges',
        requiredRoles: roles,
        userRoles
      });
    }

    next();
  };
}

/**
 * 테넌트 기반 접근 제어 미들웨어
 */
export function requireTenant(tenantId?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userTenantId = req.auth.user.tenantId;
    const requiredTenantId = tenantId || req.headers['x-tenant-id'] as string;

    if (!userTenantId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User has no tenant access'
      });
    }

    if (requiredTenantId && userTenantId !== requiredTenantId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Tenant access denied',
        userTenant: userTenantId,
        requiredTenant: requiredTenantId
      });
    }

    next();
  };
}

/**
 * API 키 전용 인증 미들웨어
 */
export function requireApiKey(options?: { permissions?: string[] }) {
  return createAuthMiddleware({
    authService: null as any, // 런타임에서 주입
    logger: null as any, // 런타임에서 주입
    allowedMethods: [AuthMethod.API_KEY],
    requiredPermissions: options?.permissions || []
  });
}

/**
 * JWT 전용 인증 미들웨어  
 */
export function requireJWT(options?: { permissions?: string[] }) {
  return createAuthMiddleware({
    authService: null as any, // 런타임에서 주입
    logger: null as any, // 런타임에서 주입  
    allowedMethods: [AuthMethod.JWT],
    requiredPermissions: options?.permissions || []
  });
}

/**
 * 선택적 인증 미들웨어 (인증되면 정보 제공, 안 되어도 통과)
 */
export function optionalAuth() {
  return createAuthMiddleware({
    authService: null as any, // 런타임에서 주입
    logger: null as any, // 런타임에서 주입
    optional: true
  });
}

/**
 * Rate Limiting 미들웨어 (사용자별)
 */
export function createUserRateLimit(options: {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
}) {
  const userLimits = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !req.auth.user) {
      return next();
    }

    const userId = req.auth.user.id;
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // 기존 제한 정보 가져오기 또는 생성
    let userLimit = userLimits.get(userId);
    if (!userLimit || userLimit.resetTime < windowStart) {
      userLimit = { count: 0, resetTime: now + options.windowMs };
      userLimits.set(userId, userLimit);
    }

    // 요청 수 증가
    userLimit.count++;

    // 제한 초과 확인
    if (userLimit.count > options.maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }

    // 응답 헤더 설정
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - userLimit.count));
    res.setHeader('X-RateLimit-Reset', new Date(userLimit.resetTime).toISOString());

    next();
  };
}

/**
 * 인증 건너뛸지 확인
 */
function shouldSkipAuth(path: string, skipPaths: string[]): boolean {
  return skipPaths.some(skipPath => {
    if (skipPath.includes('*')) {
      const regex = new RegExp(skipPath.replace(/\*/g, '.*'));
      return regex.test(path);
    }
    return path === skipPath;
  });
}

/**
 * 인증 방법 감지
 */
function detectAuthMethod(req: Request): AuthMethod | null {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return AuthMethod.JWT;
    } else if (authHeader.startsWith('Basic ')) {
      return AuthMethod.BASIC_AUTH;
    }
  }

  if (req.headers['x-api-key']) {
    return AuthMethod.API_KEY;
  }

  if (req.session && req.session.userId) {
    return AuthMethod.SESSION;
  }

  if (req.headers['x-sso-token']) {
    return AuthMethod.SSO_TOKEN;
  }

  return null;
}

/**
 * 인증 실패 처리
 */
function handleAuthFailure(res: Response, errorCode?: AuthErrorCode, message?: string): void {
  const statusCode = getStatusCodeForAuthError(errorCode);
  
  res.status(statusCode).json({
    error: getErrorNameForCode(errorCode),
    message: message || 'Authentication failed',
    code: errorCode
  });
}

/**
 * 권한 부족 처리
 */
function handleAuthzFailure(res: Response, authzResult: any): void {
  res.status(403).json({
    error: 'Forbidden',
    message: authzResult.error || 'Insufficient permissions',
    requiredPermissions: authzResult.requiredPermissions,
    missingPermissions: authzResult.missingPermissions
  });
}

/**
 * 인증 오류 코드에 따른 HTTP 상태 코드 반환
 */
function getStatusCodeForAuthError(errorCode?: AuthErrorCode): number {
  switch (errorCode) {
    case AuthErrorCode.MISSING_TOKEN:
    case AuthErrorCode.INVALID_TOKEN:
    case AuthErrorCode.EXPIRED_TOKEN:
    case AuthErrorCode.INVALID_CREDENTIALS:
      return 401;
    case AuthErrorCode.INSUFFICIENT_PERMISSIONS:
    case AuthErrorCode.TENANT_MISMATCH:
    case AuthErrorCode.PROJECT_ACCESS_DENIED:
      return 403;
    case AuthErrorCode.USER_INACTIVE:
      return 403;
    case AuthErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;
    default:
      return 401;
  }
}

/**
 * 오류 코드에 따른 에러 이름 반환
 */
function getErrorNameForCode(errorCode?: AuthErrorCode): string {
  switch (errorCode) {
    case AuthErrorCode.MISSING_TOKEN:
      return 'Missing Token';
    case AuthErrorCode.INVALID_TOKEN:
      return 'Invalid Token';
    case AuthErrorCode.EXPIRED_TOKEN:
      return 'Expired Token';
    case AuthErrorCode.INVALID_CREDENTIALS:
      return 'Invalid Credentials';
    case AuthErrorCode.INSUFFICIENT_PERMISSIONS:
      return 'Insufficient Permissions';
    case AuthErrorCode.USER_INACTIVE:
      return 'User Inactive';
    case AuthErrorCode.TENANT_MISMATCH:
      return 'Tenant Mismatch';
    case AuthErrorCode.PROJECT_ACCESS_DENIED:
      return 'Project Access Denied';
    case AuthErrorCode.RATE_LIMIT_EXCEEDED:
      return 'Rate Limit Exceeded';
    default:
      return 'Unauthorized';
  }
}