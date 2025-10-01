import { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { Logger } from '@shared/common-libs';
import { Redis } from 'ioredis';

import { CorsMiddleware, CorsConfig } from './corsMiddleware';
import { RateLimitMiddleware, RateLimitConfig } from './rateLimitMiddleware';
import { ErrorMiddleware, ErrorConfig } from './errorMiddleware';
import { createAuthMiddleware } from './authMiddleware';
import { createTenantMiddleware } from './tenantMiddleware';
import { createProxyMiddleware } from './proxyMiddleware';

export interface CommonMiddlewareConfig {
  cors: CorsConfig;
  rateLimit: RateLimitConfig;
  error: ErrorConfig;
  security: {
    enableHelmet: boolean;
    enableCompression: boolean;
    compressionLevel: number;
    enableRequestSizeLimits: boolean;
    maxRequestSize: string;
    enableSlowLoris: boolean;
    slowLorisTimeout: number;
  };
  logging: {
    enableRequestLogging: boolean;
    enableResponseLogging: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    enableMetrics: boolean;
  };
}

export class CommonMiddleware {
  private app: Application;
  private logger: Logger;
  private config: CommonMiddlewareConfig;
  private redis?: Redis;
  
  private corsMiddleware: CorsMiddleware;
  private rateLimitMiddleware: RateLimitMiddleware;
  private errorMiddleware: ErrorMiddleware;

  private requestStats = {
    totalRequests: 0,
    requestsByMethod: {} as Record<string, number>,
    requestsByPath: {} as Record<string, number>,
    averageResponseTime: 0,
    requestsSinceStart: 0
  };

  constructor(
    app: Application,
    logger: Logger,
    config: CommonMiddlewareConfig,
    redis?: Redis
  ) {
    this.app = app;
    this.logger = logger;
    this.config = config;
    this.redis = redis;

    // 미들웨어 인스턴스 생성
    this.corsMiddleware = new CorsMiddleware(logger, config.cors);
    this.rateLimitMiddleware = new RateLimitMiddleware(logger, config.rateLimit, redis);
    this.errorMiddleware = new ErrorMiddleware(logger, config.error);
  }

  /**
   * 모든 공통 미들웨어 설정
   */
  setupMiddlewares(services: {
    authService?: any;
    tenantResolver?: any;
    routerService?: any;
    proxyService?: any;
  } = {}): void {
    this.logger.info('공통 미들웨어 설정 시작');

    // 1. 보안 미들웨어 (가장 먼저)
    this.setupSecurityMiddlewares();

    // 2. 요청 처리 미들웨어
    this.setupRequestProcessingMiddlewares();

    // 3. CORS 미들웨어
    this.setupCorsMiddlewares();

    // 4. Rate Limiting 미들웨어
    this.setupRateLimitMiddlewares();

    // 5. 요청 로깅 미들웨어
    if (this.config.logging.enableRequestLogging) {
      this.setupRequestLoggingMiddleware();
    }

    // 6. 테넌트 컨텍스트 미들웨어 (선택적)
    if (services.tenantResolver) {
      this.setupTenantMiddleware(services.tenantResolver);
    }

    // 7. 인증 미들웨어 (선택적)
    if (services.authService) {
      this.setupAuthMiddleware(services.authService);
    }

    // 8. 프록시 미들웨어 (API 경로에만)
    if (services.routerService && services.proxyService) {
      this.setupProxyMiddleware(services.routerService, services.proxyService);
    }

    // 9. 404 핸들러
    this.setup404Handler();

    // 10. 전역 에러 핸들러 (가장 마지막)
    this.setupErrorHandlers();

    this.logger.info('공통 미들웨어 설정 완료');
  }

  /**
   * 보안 미들웨어 설정
   */
  private setupSecurityMiddlewares(): void {
    if (this.config.security.enableHelmet) {
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false
      }));
    }

    // 요청 크기 제한
    if (this.config.security.enableRequestSizeLimits) {
      this.app.use(this.createRequestSizeLimitMiddleware());
    }

    // Slow Loris 공격 방지
    if (this.config.security.enableSlowLoris) {
      this.app.use(this.createSlowLorisProtectionMiddleware());
    }

    // 추가 보안 헤더
    this.app.use(this.corsMiddleware.addSecurityHeaders());
  }

  /**
   * 요청 처리 미들웨어 설정
   */
  private setupRequestProcessingMiddlewares(): void {
    // Request ID 생성
    this.app.use(this.createRequestIdMiddleware());

    // 압축
    if (this.config.security.enableCompression) {
      this.app.use(compression({
        level: this.config.security.compressionLevel,
        threshold: 1024,
        filter: (req, res) => {
          if (req.headers['x-no-compression']) {
            return false;
          }
          return compression.filter(req, res);
        }
      }));
    }

    // 요청 메트릭 수집
    if (this.config.logging.enableMetrics) {
      this.app.use(this.createMetricsMiddleware());
    }
  }

  /**
   * CORS 미들웨어 설정
   */
  private setupCorsMiddlewares(): void {
    this.app.use(this.corsMiddleware.handlePreflight());
    this.app.use(this.corsMiddleware.createCorsMiddleware());
  }

  /**
   * Rate Limiting 미들웨어 설정
   */
  private setupRateLimitMiddlewares(): void {
    this.app.use(this.rateLimitMiddleware.createRateLimitMiddleware());
  }

  /**
   * 요청 로깅 미들웨어 설정
   */
  private setupRequestLoggingMiddleware(): void {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // 응답 완료 시 로그
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        this.logger.info('HTTP 요청', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          requestId: req.headers['x-request-id'],
          tenantId: req.tenantId,
          userId: req.auth?.user?.id || req.user?.id
        });
      });

      next();
    });
  }

  /**
   * 테넌트 미들웨어 설정
   */
  private setupTenantMiddleware(tenantResolver: any): void {
    const tenantMiddleware = createTenantMiddleware({
      tenantResolver,
      logger: this.logger,
      options: {
        headerNames: {
          tenantId: 'X-Tenant-Id',
          projectCode: 'X-Project-Code',
          organizationId: 'X-Organization-Id'
        },
        enableValidation: true,
        enableCaching: true,
        cacheTimeout: 300000, // 5분
        enableMetrics: true
      },
      optional: true, // 테넌트가 필수가 아님
      skipPaths: ['/health', '/metrics', '/auth/*']
    });

    this.app.use(tenantMiddleware);
  }

  /**
   * 인증 미들웨어 설정
   */
  private setupAuthMiddleware(authService: any): void {
    const authMiddleware = createAuthMiddleware({
      authService,
      logger: this.logger,
      optional: true, // 전역적으로는 선택적
      skipPaths: ['/health', '/metrics', '/auth/login', '/auth/refresh']
    });

    this.app.use(authMiddleware);
  }

  /**
   * 프록시 미들웨어 설정
   */
  private setupProxyMiddleware(routerService: any, proxyService: any): void {
    const proxyMiddleware = createProxyMiddleware({
      routerService,
      proxyService,
      logger: this.logger
    });

    // API 경로에만 프록시 적용
    this.app.use('/api', proxyMiddleware);
  }

  /**
   * 404 핸들러 설정
   */
  private setup404Handler(): void {
    this.app.use(this.errorMiddleware.createNotFoundHandler());
  }

  /**
   * 에러 핸들러 설정
   */
  private setupErrorHandlers(): void {
    // 유효성 검사 에러 핸들러
    this.app.use(this.errorMiddleware.handleValidationError());
    
    // 전역 에러 핸들러
    this.app.use(this.errorMiddleware.createErrorHandler());
  }

  /**
   * Request ID 생성 미들웨어
   */
  private createRequestIdMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || 
                       `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      
      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);
      next();
    };
  }

  /**
   * 요청 크기 제한 미들웨어
   */
  private createRequestSizeLimitMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const maxSize = this.parseSize(this.config.security.maxRequestSize);
      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength > maxSize) {
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `Request size ${contentLength} exceeds limit ${maxSize}`,
          maxSize
        });
      }
      
      next();
    };
  }

  /**
   * Slow Loris 공격 방지 미들웨어
   */
  private createSlowLorisProtectionMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          res.status(408).json({
            error: 'Request Timeout',
            message: 'Request took too long to complete'
          });
        }
      }, this.config.security.slowLorisTimeout);

      res.on('finish', () => {
        clearTimeout(timeout);
      });

      next();
    };
  }

  /**
   * 메트릭 수집 미들웨어
   */
  private createMetricsMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // 요청 통계 업데이트
      this.requestStats.totalRequests++;
      this.requestStats.requestsSinceStart++;
      
      this.requestStats.requestsByMethod[req.method] = 
        (this.requestStats.requestsByMethod[req.method] || 0) + 1;
      
      this.requestStats.requestsByPath[req.path] = 
        (this.requestStats.requestsByPath[req.path] || 0) + 1;

      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        // 평균 응답 시간 계산
        const currentAvg = this.requestStats.averageResponseTime;
        const totalRequests = this.requestStats.requestsSinceStart;
        this.requestStats.averageResponseTime = 
          ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
      });

      next();
    };
  }

  /**
   * 크기 문자열 파싱 (예: '10mb' -> bytes)
   */
  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024
    };

    const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
    if (!match) {
      return 1024 * 1024; // 기본 1MB
    }

    const [, amount, unit] = match;
    return parseFloat(amount) * units[unit];
  }

  /**
   * 통계 조회
   */
  getStats() {
    return {
      requests: this.requestStats,
      cors: this.corsMiddleware.getCorsStats(),
      rateLimit: this.rateLimitMiddleware.getStats(),
      errors: this.errorMiddleware.getErrorStats()
    };
  }

  /**
   * 통계 초기화
   */
  resetStats(): void {
    this.requestStats = {
      totalRequests: 0,
      requestsByMethod: {},
      requestsByPath: {},
      averageResponseTime: 0,
      requestsSinceStart: 0
    };
    
    this.errorMiddleware.resetStats();
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.rateLimitMiddleware.destroy();
    this.logger.info('CommonMiddleware 종료');
  }
}