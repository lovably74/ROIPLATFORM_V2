import { Request, Response, NextFunction } from 'express';
import { TenantResolverService } from '../services/TenantResolverService';
import { TenantInjectionOptions, TenantContext, TenantErrorCode } from '../types/tenant';
import { Logger } from '@shared/common-libs';

export interface TenantMiddlewareOptions {
  tenantResolver: TenantResolverService;
  logger: Logger;
  options: TenantInjectionOptions;
  optional?: boolean; // 테넌트가 필수가 아닌 경우
  skipPaths?: string[]; // 테넌트 해결을 건너뛸 경로
}

/**
 * 테넌트 컨텍스트 주입 미들웨어 생성
 */
export function createTenantMiddleware(config: TenantMiddlewareOptions) {
  const { tenantResolver, logger, options, optional = false, skipPaths = [] } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 건너뛸 경로 확인
      if (shouldSkipTenantResolution(req.path, skipPaths)) {
        return next();
      }

      const startTime = Date.now();

      // 테넌트 해결
      const resolutionResult = await tenantResolver.resolveTenant(req);
      
      if (!resolutionResult.success) {
        // 선택적 테넌트인 경우 실패해도 통과
        if (optional) {
          logger.debug('테넌트 해결 실패 (선택적)', {
            path: req.path,
            error: resolutionResult.error
          });
          return next();
        }

        // 필수 테넌트인 경우 오류 응답
        logger.warn('테넌트 해결 실패', {
          path: req.path,
          error: resolutionResult.error
        });

        return res.status(400).json({
          error: 'Bad Request',
          message: 'Tenant identification failed',
          details: resolutionResult.error
        });
      }

      // 테넌트 ID가 있는 경우 검증 및 컨텍스트 생성
      if (resolutionResult.tenantId) {
        if (options.enableValidation) {
          const validationResult = await tenantResolver.validateAndCreateContext(
            resolutionResult.tenantId,
            resolutionResult.projectCode
          );

          if (!validationResult.valid) {
            return handleTenantValidationError(res, validationResult, logger);
          }

          // 요청 객체에 테넌트 정보 설정
          req.tenant = validationResult.context!;
          req.tenantId = resolutionResult.tenantId;
          req.projectCode = resolutionResult.projectCode;

          // 콜백 실행
          if (options.onTenantResolved) {
            options.onTenantResolved(validationResult.context!);
          }

        } else {
          // 검증 없이 기본 정보만 설정
          req.tenantId = resolutionResult.tenantId;
          req.projectCode = resolutionResult.projectCode;
        }

        // 다운스트림 서비스를 위한 헤더 주입
        injectTenantHeaders(req, res, resolutionResult, options);

        // 메트릭 기록
        if (options.enableMetrics) {
          const resolutionTime = Date.now() - startTime;
          logger.debug('테넌트 해결 완료', {
            tenantId: resolutionResult.tenantId,
            projectCode: resolutionResult.projectCode,
            strategy: resolutionResult.strategy,
            resolutionTime
          });
        }
      }

      next();

    } catch (error) {
      logger.error('테넌트 미들웨어 오류', {
        path: req.path,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Tenant processing failed'
      });
    }
  };
}

/**
 * 테넌트별 Rate Limiting 미들웨어
 */
export function createTenantRateLimit(options: {
  windowMs: number;
  defaultMaxRequests: number;
  premiumMultiplier?: number;
  enterpriseMultiplier?: number;
}) {
  const tenantLimits = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant || !req.tenantId) {
      return next();
    }

    const tenantId = req.tenantId;
    const tier = req.tenant.tier;
    
    // 티어별 제한량 계산
    let maxRequests = options.defaultMaxRequests;
    if (tier === 'premium' && options.premiumMultiplier) {
      maxRequests *= options.premiumMultiplier;
    } else if (tier === 'enterprise' && options.enterpriseMultiplier) {
      maxRequests *= options.enterpriseMultiplier;
    }

    // 테넌트 쿼터에서 지정된 제한이 있으면 사용
    if (req.tenant.quotas?.rateLimit) {
      maxRequests = req.tenant.quotas.rateLimit.requests;
    }

    const now = Date.now();
    const windowStart = now - options.windowMs;

    // 기존 제한 정보 가져오기 또는 생성
    let tenantLimit = tenantLimits.get(tenantId);
    if (!tenantLimit || tenantLimit.resetTime < windowStart) {
      tenantLimit = { count: 0, resetTime: now + options.windowMs };
      tenantLimits.set(tenantId, tenantLimit);
    }

    // 요청 수 증가
    tenantLimit.count++;

    // 제한 초과 확인
    if (tenantLimit.count > maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Tenant rate limit exceeded (${maxRequests} requests per ${options.windowMs}ms)`,
        tenantId,
        tier,
        retryAfter: Math.ceil((tenantLimit.resetTime - now) / 1000)
      });
    }

    // 응답 헤더 설정
    res.setHeader('X-RateLimit-Tenant-Limit', maxRequests);
    res.setHeader('X-RateLimit-Tenant-Remaining', Math.max(0, maxRequests - tenantLimit.count));
    res.setHeader('X-RateLimit-Tenant-Reset', new Date(tenantLimit.resetTime).toISOString());

    next();
  };
}

/**
 * 테넌트 기능 검증 미들웨어
 */
export function requireTenantFeature(featureName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant context required'
      });
    }

    if (!req.tenant.features.includes(featureName)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Feature '${featureName}' is not available for this tenant`,
        tenantId: req.tenant.tenantId,
        tier: req.tenant.tier,
        availableFeatures: req.tenant.features
      });
    }

    next();
  };
}

/**
 * 테넌트 쿼터 검증 미들웨어
 */
export function validateTenantQuota(quotaType: keyof TenantContext['quotas']) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant context required'
      });
    }

    // TODO: 실제 사용량 확인 로직 구현
    // 예시: 사용자 수, 프로젝트 수, API 호출 수, 저장소 사용량 등
    
    const quotas = req.tenant.quotas;
    const currentUsage = await getCurrentUsage(req.tenant.tenantId, quotaType);
    
    let limit: number;
    switch (quotaType) {
      case 'maxUsers':
        limit = quotas.maxUsers;
        break;
      case 'maxProjects':
        limit = quotas.maxProjects;
        break;
      case 'maxApiCalls':
        limit = quotas.maxApiCalls;
        break;
      case 'maxStorage':
        limit = quotas.maxStorage;
        break;
      default:
        return next();
    }

    if (currentUsage >= limit) {
      return res.status(403).json({
        error: 'Quota Exceeded',
        message: `Tenant ${quotaType} quota exceeded`,
        tenantId: req.tenant.tenantId,
        quotaType,
        limit,
        currentUsage
      });
    }

    next();
  };
}

/**
 * 프로젝트 필수 미들웨어
 */
export function requireProject() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Tenant context required'
      });
    }

    if (!req.projectCode) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Project code is required',
        tenantId: req.tenant.tenantId
      });
    }

    next();
  };
}

/**
 * 테넌트 지역 검증 미들웨어
 */
export function validateTenantRegion(allowedRegions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant) {
      return next();
    }

    if (req.tenant.region && !allowedRegions.includes(req.tenant.region)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Tenant region not allowed for this service',
        tenantId: req.tenant.tenantId,
        tenantRegion: req.tenant.region,
        allowedRegions
      });
    }

    next();
  };
}

/**
 * 테넌트 해결 건너뛰기 판단
 */
function shouldSkipTenantResolution(path: string, skipPaths: string[]): boolean {
  return skipPaths.some(skipPath => {
    if (skipPath.includes('*')) {
      const regex = new RegExp(skipPath.replace(/\*/g, '.*'));
      return regex.test(path);
    }
    return path === skipPath;
  });
}

/**
 * 테넌트 헤더 주입
 */
function injectTenantHeaders(
  req: Request,
  res: Response,
  resolutionResult: any,
  options: TenantInjectionOptions
): void {
  // 기존 헤더가 없는 경우에만 주입
  if (!req.headers[options.headerNames.tenantId.toLowerCase()]) {
    req.headers[options.headerNames.tenantId.toLowerCase()] = resolutionResult.tenantId;
  }

  if (resolutionResult.projectCode && !req.headers[options.headerNames.projectCode.toLowerCase()]) {
    req.headers[options.headerNames.projectCode.toLowerCase()] = resolutionResult.projectCode;
  }

  if (req.tenant?.organizationId && !req.headers[options.headerNames.organizationId.toLowerCase()]) {
    req.headers[options.headerNames.organizationId.toLowerCase()] = req.tenant.organizationId;
  }

  // 응답 헤더에도 테넌트 정보 추가 (디버깅용)
  res.setHeader('X-Tenant-Resolved-By', resolutionResult.strategy || 'unknown');
  if (resolutionResult.tenantId) {
    res.setHeader('X-Tenant-ID', resolutionResult.tenantId);
  }
}

/**
 * 테넌트 검증 오류 처리
 */
function handleTenantValidationError(
  res: Response,
  validationResult: any,
  logger: Logger
): void {
  const statusCode = getStatusCodeForTenantError(validationResult.errorCode);
  
  logger.warn('테넌트 검증 실패', {
    error: validationResult.error,
    errorCode: validationResult.errorCode
  });

  res.status(statusCode).json({
    error: getErrorNameForTenantError(validationResult.errorCode),
    message: validationResult.error,
    code: validationResult.errorCode
  });
}

/**
 * 테넌트 오류 코드에 따른 HTTP 상태 코드
 */
function getStatusCodeForTenantError(errorCode?: TenantErrorCode): number {
  switch (errorCode) {
    case TenantErrorCode.TENANT_NOT_FOUND:
    case TenantErrorCode.PROJECT_NOT_FOUND:
      return 404;
    case TenantErrorCode.TENANT_SUSPENDED:
    case TenantErrorCode.TENANT_DELETED:
    case TenantErrorCode.PROJECT_ARCHIVED:
      return 403;
    case TenantErrorCode.QUOTA_EXCEEDED:
      return 403;
    case TenantErrorCode.INVALID_SUBDOMAIN:
      return 400;
    case TenantErrorCode.REGION_MISMATCH:
    case TenantErrorCode.FEATURE_NOT_AVAILABLE:
      return 403;
    default:
      return 400;
  }
}

/**
 * 테넌트 오류 코드에 따른 에러 이름
 */
function getErrorNameForTenantError(errorCode?: TenantErrorCode): string {
  switch (errorCode) {
    case TenantErrorCode.TENANT_NOT_FOUND:
      return 'Tenant Not Found';
    case TenantErrorCode.TENANT_SUSPENDED:
      return 'Tenant Suspended';
    case TenantErrorCode.TENANT_DELETED:
      return 'Tenant Deleted';
    case TenantErrorCode.PROJECT_NOT_FOUND:
      return 'Project Not Found';
    case TenantErrorCode.PROJECT_ARCHIVED:
      return 'Project Archived';
    case TenantErrorCode.INVALID_SUBDOMAIN:
      return 'Invalid Subdomain';
    case TenantErrorCode.QUOTA_EXCEEDED:
      return 'Quota Exceeded';
    case TenantErrorCode.REGION_MISMATCH:
      return 'Region Mismatch';
    case TenantErrorCode.FEATURE_NOT_AVAILABLE:
      return 'Feature Not Available';
    default:
      return 'Tenant Error';
  }
}

/**
 * 현재 사용량 조회 (TODO: 실제 구현)
 */
async function getCurrentUsage(tenantId: string, quotaType: string): Promise<number> {
  // TODO: 실제 사용량 조회 로직 구현
  // 데이터베이스에서 현재 사용량 조회
  return 0;
}