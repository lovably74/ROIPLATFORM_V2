import { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import { Logger } from '@shared/common-libs';

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  allowCredentials: boolean;
  maxAge: number;
  enablePreflightForAll: boolean;
  dynamicOrigin: boolean;
}

export class CorsMiddleware {
  private logger: Logger;
  private config: CorsConfig;

  constructor(logger: Logger, config: CorsConfig) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * CORS 미들웨어 생성
   */
  createCorsMiddleware() {
    const corsOptions: CorsOptions = {
      origin: this.config.dynamicOrigin ? this.dynamicOriginHandler.bind(this) : this.config.allowedOrigins,
      methods: this.config.allowedMethods,
      allowedHeaders: this.config.allowedHeaders,
      exposedHeaders: this.config.exposedHeaders,
      credentials: this.config.allowCredentials,
      maxAge: this.config.maxAge,
      preflightContinue: false,
      optionsSuccessStatus: 204
    };

    return cors(corsOptions);
  }

  /**
   * 동적 Origin 핸들러
   */
  private dynamicOriginHandler(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Origin이 없는 경우 (예: 모바일 앱, Postman 등)
    if (!origin) {
      return callback(null, true);
    }

    // 와일드카드 패턴 매칭
    const isAllowed = this.config.allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin === '*') {
        return true;
      }
      
      if (allowedOrigin.includes('*')) {
        const regex = new RegExp(allowedOrigin.replace(/\*/g, '.*'));
        return regex.test(origin);
      }
      
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      this.logger.debug('CORS 허용', { origin });
      callback(null, true);
    } else {
      this.logger.warn('CORS 차단', { origin, allowedOrigins: this.config.allowedOrigins });
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    }
  }

  /**
   * Preflight 요청 처리
   */
  handlePreflight() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Methods', this.config.allowedMethods.join(', '));
        res.header('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
        res.header('Access-Control-Max-Age', this.config.maxAge.toString());
        
        if (this.config.allowCredentials) {
          res.header('Access-Control-Allow-Credentials', 'true');
        }

        this.logger.debug('Preflight 요청 처리', {
          origin: req.headers.origin,
          method: req.headers['access-control-request-method'],
          headers: req.headers['access-control-request-headers']
        });

        return res.status(204).end();
      }
      next();
    };
  }

  /**
   * 보안 헤더 추가
   */
  addSecurityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // 기본 보안 헤더
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // 테넌트별 추가 헤더 (있는 경우)
      if (req.tenant?.metadata?.securityHeaders) {
        const customHeaders = req.tenant.metadata.securityHeaders;
        Object.entries(customHeaders).forEach(([key, value]) => {
          res.header(key, value as string);
        });
      }

      next();
    };
  }

  /**
   * CORS 통계 조회
   */
  getCorsStats(): {
    allowedOrigins: string[];
    totalRequests: number;
    blockedRequests: number;
  } {
    // TODO: 실제 통계 수집 구현
    return {
      allowedOrigins: this.config.allowedOrigins,
      totalRequests: 0,
      blockedRequests: 0
    };
  }
}