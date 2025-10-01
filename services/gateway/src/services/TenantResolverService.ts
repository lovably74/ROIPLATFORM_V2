import { Request } from 'express';
import { 
  TenantResolutionConfig, 
  TenantResolutionResult, 
  TenantResolutionStrategy,
  Tenant,
  Project,
  TenantContext,
  TenantCache,
  TenantValidationResult,
  TenantErrorCode,
  TenantMetrics
} from '../types/tenant';
import { JWTPayload } from '../types/auth';
import { Logger } from '@shared/common-libs';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';

export class TenantResolverService {
  private logger: Logger;
  private config: TenantResolutionConfig;
  private redis?: Redis;
  private cache: Map<string, TenantCache> = new Map();
  private metrics: TenantMetrics;

  constructor(
    logger: Logger, 
    config: TenantResolutionConfig, 
    redis?: Redis
  ) {
    this.logger = logger;
    this.config = config;
    this.redis = redis;
    this.metrics = {
      totalRequests: 0,
      requestsByTenant: {},
      requestsByProject: {},
      cacheHitRate: 0,
      averageResolutionTime: 0,
      failedResolutions: 0
    };
  }

  /**
   * 요청에서 테넌트 정보 해결
   */
  async resolveTenant(req: Request): Promise<TenantResolutionResult> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // 우선순위에 따라 정렬된 전략들
      const enabledStrategies = this.config.strategies
        .filter(strategy => strategy.enabled)
        .sort((a, b) => b.priority - a.priority);

      for (const strategy of enabledStrategies) {
        const result = await this.executeStrategy(strategy, req);
        
        if (result.success && result.tenantId) {
          // 메트릭 업데이트
          const resolutionTime = Date.now() - startTime;
          this.updateMetrics(result.tenantId, result.projectCode, resolutionTime);
          
          this.logger.debug('테넌트 해결 성공', {
            tenantId: result.tenantId,
            projectCode: result.projectCode,
            strategy: strategy.type,
            resolutionTime
          });

          return result;
        }
      }

      // 모든 전략 실패 시 폴백 처리
      if (this.config.fallbackTenantId) {
        this.logger.debug('폴백 테넌트 사용', { 
          fallbackTenantId: this.config.fallbackTenantId 
        });
        
        return {
          success: true,
          tenantId: this.config.fallbackTenantId,
          strategy: 'fallback'
        };
      }

      // Strict 모드에서는 테넌트가 필수
      if (this.config.strictMode) {
        this.metrics.failedResolutions++;
        return {
          success: false,
          error: 'Tenant resolution failed in strict mode'
        };
      }

      // Non-strict 모드에서는 테넌트 없이도 허용
      return {
        success: true,
        strategy: 'none'
      };

    } catch (error) {
      this.metrics.failedResolutions++;
      this.logger.error('테넌트 해결 중 오류', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 테넌트 정보 검증 및 컨텍스트 생성
   */
  async validateAndCreateContext(
    tenantId: string, 
    projectCode?: string
  ): Promise<TenantValidationResult> {
    try {
      // 캐시에서 확인
      const cacheKey = `${tenantId}:${projectCode || ''}`;
      const cached = await this.getCachedTenant(cacheKey);
      
      if (cached) {
        return {
          valid: true,
          tenant: cached.tenant,
          project: projectCode ? cached.projects.find(p => p.code === projectCode) : undefined,
          context: cached.context
        };
      }

      // 데이터베이스에서 테넌트 조회
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        return {
          valid: false,
          error: 'Tenant not found',
          errorCode: TenantErrorCode.TENANT_NOT_FOUND
        };
      }

      // 테넌트 상태 확인
      if (tenant.status === 'suspended') {
        return {
          valid: false,
          error: 'Tenant is suspended',
          errorCode: TenantErrorCode.TENANT_SUSPENDED
        };
      }

      if (tenant.status === 'deleted') {
        return {
          valid: false,
          error: 'Tenant is deleted',
          errorCode: TenantErrorCode.TENANT_DELETED
        };
      }

      // 프로젝트 검증 (제공된 경우)
      let project: Project | undefined;
      if (projectCode) {
        project = await this.getProjectByCode(tenantId, projectCode);
        if (!project) {
          return {
            valid: false,
            error: 'Project not found',
            errorCode: TenantErrorCode.PROJECT_NOT_FOUND
          };
        }

        if (project.status === 'archived') {
          return {
            valid: false,
            error: 'Project is archived',
            errorCode: TenantErrorCode.PROJECT_ARCHIVED
          };
        }
      }

      // 테넌트 컨텍스트 생성
      const context = await this.createTenantContext(tenant, project);
      
      // 캐시에 저장
      await this.cacheTenantInfo(cacheKey, tenant, context, project ? [project] : []);

      return {
        valid: true,
        tenant,
        project,
        context
      };

    } catch (error) {
      this.logger.error('테넌트 검증 중 오류', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation error'
      };
    }
  }

  /**
   * 특정 전략 실행
   */
  private async executeStrategy(
    strategy: TenantResolutionStrategy, 
    req: Request
  ): Promise<TenantResolutionResult> {
    switch (strategy.type) {
      case 'header':
        return this.resolveFromHeader(req, strategy.config);
      
      case 'subdomain':
        return this.resolveFromSubdomain(req, strategy.config);
      
      case 'path':
        return this.resolveFromPath(req, strategy.config);
      
      case 'jwt':
        return this.resolveFromJWT(req, strategy.config);
      
      case 'custom':
        return this.resolveFromCustom(req, strategy.config);
      
      default:
        return { success: false, error: `Unknown strategy: ${strategy.type}` };
    }
  }

  /**
   * 헤더에서 테넌트 해결
   */
  private async resolveFromHeader(
    req: Request, 
    config: Record<string, any>
  ): Promise<TenantResolutionResult> {
    const tenantIdHeader = config.tenantIdHeader || 'x-tenant-id';
    const projectCodeHeader = config.projectCodeHeader || 'x-project-code';
    
    const tenantId = req.headers[tenantIdHeader] as string;
    const projectCode = req.headers[projectCodeHeader] as string;

    if (!tenantId) {
      return { success: false, error: 'Tenant ID header not found' };
    }

    return {
      success: true,
      tenantId,
      projectCode,
      strategy: 'header'
    };
  }

  /**
   * 서브도메인에서 테넌트 해결
   */
  private async resolveFromSubdomain(
    req: Request, 
    config: Record<string, any>
  ): Promise<TenantResolutionResult> {
    const host = req.headers.host;
    if (!host) {
      return { success: false, error: 'Host header not found' };
    }

    const baseDomain = config.baseDomain;
    if (!baseDomain) {
      return { success: false, error: 'Base domain not configured' };
    }

    // 서브도메인 추출: tenant.example.com -> tenant
    const subdomain = host.replace(`.${baseDomain}`, '');
    
    if (subdomain === host) {
      return { success: false, error: 'No subdomain found' };
    }

    // 서브도메인으로 테넌트 조회
    const tenant = await this.getTenantBySubdomain(subdomain);
    if (!tenant) {
      return { success: false, error: 'Tenant not found for subdomain' };
    }

    return {
      success: true,
      tenantId: tenant.id,
      strategy: 'subdomain',
      metadata: { subdomain }
    };
  }

  /**
   * URL 경로에서 테넌트 해결
   */
  private async resolveFromPath(
    req: Request, 
    config: Record<string, any>
  ): Promise<TenantResolutionResult> {
    const pattern = config.pattern || '/tenant/:tenantId';
    const path = req.path;

    // 간단한 패턴 매칭 (실제로는 더 정교한 라우팅 라이브러리 사용 권장)
    const regex = new RegExp(pattern.replace(':tenantId', '([^/]+)').replace(':projectCode', '([^/]+)'));
    const matches = path.match(regex);

    if (!matches) {
      return { success: false, error: 'Path pattern not matched' };
    }

    const tenantId = matches[1];
    const projectCode = matches[2];

    return {
      success: true,
      tenantId,
      projectCode,
      strategy: 'path'
    };
  }

  /**
   * JWT 토큰에서 테넌트 해결
   */
  private async resolveFromJWT(
    req: Request, 
    config: Record<string, any>
  ): Promise<TenantResolutionResult> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'JWT token not found' };
    }

    try {
      const token = authHeader.substring(7);
      const decoded = jwt.decode(token) as JWTPayload;

      if (!decoded || !decoded.tenantId) {
        return { success: false, error: 'Tenant ID not found in JWT' };
      }

      return {
        success: true,
        tenantId: decoded.tenantId,
        projectCode: decoded.projectCodes?.[0], // 첫 번째 프로젝트 사용
        strategy: 'jwt'
      };

    } catch (error) {
      return { 
        success: false, 
        error: `JWT decode error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * 커스텀 해결 로직
   */
  private async resolveFromCustom(
    req: Request, 
    config: Record<string, any>
  ): Promise<TenantResolutionResult> {
    // 커스텀 로직 구현 예시
    // 실제로는 config.resolver 함수를 실행하거나 외부 서비스 호출
    
    return { success: false, error: 'Custom resolver not implemented' };
  }

  /**
   * 테넌트 컨텍스트 생성
   */
  private async createTenantContext(tenant: Tenant, project?: Project): Promise<TenantContext> {
    return {
      tenantId: tenant.id,
      projectCode: project?.code,
      subdomain: tenant.subdomain,
      organizationId: tenant.organizationId,
      region: tenant.region,
      environment: tenant.environment,
      tier: tenant.tier,
      features: tenant.features,
      quotas: tenant.quotas,
      metadata: {
        ...tenant.metadata,
        ...(project ? { project: project.metadata } : {})
      }
    };
  }

  /**
   * 캐시에서 테넌트 정보 조회
   */
  private async getCachedTenant(cacheKey: string): Promise<TenantCache | null> {
    if (!this.config.enableCaching) {
      return null;
    }

    // Redis 캐시 확인
    if (this.redis) {
      try {
        const cached = await this.redis.get(`tenant:${cacheKey}`);
        if (cached) {
          const parsedCache = JSON.parse(cached) as TenantCache;
          
          if (parsedCache.expiresAt > new Date()) {
            this.updateCacheHitRate(true);
            return parsedCache;
          }
          
          // 만료된 캐시 삭제
          await this.redis.del(`tenant:${cacheKey}`);
        }
      } catch (error) {
        this.logger.warn('Redis 캐시 조회 실패', error);
      }
    }

    // 메모리 캐시 확인
    const memoryCache = this.cache.get(cacheKey);
    if (memoryCache && memoryCache.expiresAt > new Date()) {
      this.updateCacheHitRate(true);
      return memoryCache;
    }

    // 만료된 메모리 캐시 삭제
    if (memoryCache) {
      this.cache.delete(cacheKey);
    }

    this.updateCacheHitRate(false);
    return null;
  }

  /**
   * 테넌트 정보 캐시
   */
  private async cacheTenantInfo(
    cacheKey: string, 
    tenant: Tenant, 
    context: TenantContext, 
    projects: Project[]
  ): Promise<void> {
    if (!this.config.enableCaching) {
      return;
    }

    const expiresAt = new Date(Date.now() + this.config.cacheTimeout);
    const cacheData: TenantCache = {
      tenant,
      context,
      projects,
      cachedAt: new Date(),
      expiresAt
    };

    // Redis 캐시
    if (this.redis) {
      try {
        await this.redis.setex(
          `tenant:${cacheKey}`, 
          Math.floor(this.config.cacheTimeout / 1000), 
          JSON.stringify(cacheData)
        );
      } catch (error) {
        this.logger.warn('Redis 캐시 저장 실패', error);
      }
    }

    // 메모리 캐시
    this.cache.set(cacheKey, cacheData);
  }

  /**
   * 메트릭 업데이트
   */
  private updateMetrics(tenantId: string, projectCode?: string, resolutionTime?: number): void {
    this.metrics.requestsByTenant[tenantId] = (this.metrics.requestsByTenant[tenantId] || 0) + 1;
    
    if (projectCode) {
      const projectKey = `${tenantId}:${projectCode}`;
      this.metrics.requestsByProject[projectKey] = (this.metrics.requestsByProject[projectKey] || 0) + 1;
    }

    if (resolutionTime !== undefined) {
      // 단순한 이동 평균 계산
      const currentAvg = this.metrics.averageResolutionTime;
      const totalRequests = this.metrics.totalRequests;
      this.metrics.averageResolutionTime = ((currentAvg * (totalRequests - 1)) + resolutionTime) / totalRequests;
    }
  }

  /**
   * 캐시 적중률 업데이트
   */
  private updateCacheHitRate(hit: boolean): void {
    const currentRate = this.metrics.cacheHitRate;
    const totalRequests = this.metrics.totalRequests;
    const adjustment = hit ? 1 : 0;
    
    this.metrics.cacheHitRate = ((currentRate * (totalRequests - 1)) + adjustment) / totalRequests;
  }

  /**
   * ID로 테넌트 조회 (TODO: 실제 데이터베이스 연동)
   */
  private async getTenantById(tenantId: string): Promise<Tenant | null> {
    // TODO: 실제 데이터베이스에서 테넌트 조회
    return null;
  }

  /**
   * 서브도메인으로 테넌트 조회 (TODO: 실제 데이터베이스 연동)
   */
  private async getTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
    // TODO: 실제 데이터베이스에서 테넌트 조회
    return null;
  }

  /**
   * 프로젝트 조회 (TODO: 실제 데이터베이스 연동)
   */
  private async getProjectByCode(tenantId: string, projectCode: string): Promise<Project | null> {
    // TODO: 실제 데이터베이스에서 프로젝트 조회
    return null;
  }

  /**
   * 테넌트 해결 통계 조회
   */
  getMetrics(): TenantMetrics {
    return { ...this.metrics };
  }

  /**
   * 캐시 정리
   */
  clearCache(): void {
    this.cache.clear();
    if (this.redis) {
      // Redis 캐시는 TTL로 자동 정리됨
      this.logger.info('테넌트 캐시 정리 완료');
    }
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.cache.clear();
    this.logger.info('TenantResolverService 종료');
  }
}