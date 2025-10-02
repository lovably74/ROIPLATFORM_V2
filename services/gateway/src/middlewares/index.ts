import { Application } from 'express';
import { authMiddleware } from './authMiddleware';
import { tenantMiddleware } from './tenantMiddleware';
import { rateLimitMiddleware } from './rateLimitMiddleware';
import { proxyMiddleware } from './proxyMiddleware';
import { errorMiddleware } from './errorMiddleware';
import { corsMiddleware } from './corsMiddleware';
import { commonMiddleware } from './commonMiddleware';

export interface MiddlewareConfig {
  redis: any;
  config: any;
  logger: any;
  serviceRegistry: any;
  metricsCollector: any;
}

/**
 * 모든 미들웨어를 설정하는 함수
 */
export function setupMiddlewares(app: Application, config: MiddlewareConfig): void {
  const { redis, config: appConfig, logger, serviceRegistry, metricsCollector } = config;

  // 공통 미들웨어
  app.use(commonMiddleware(appConfig, logger));

  // CORS 미들웨어
  app.use(corsMiddleware(appConfig));

  // Rate Limiting 미들웨어
  app.use(rateLimitMiddleware(redis, appConfig));

  // 테넌트 미들웨어
  app.use(tenantMiddleware(appConfig, logger));

  // 인증 미들웨어 (선택적)
  app.use(authMiddleware(appConfig, logger));

  // 프록시 미들웨어
  app.use(proxyMiddleware(serviceRegistry, appConfig, logger));

  // 에러 미들웨어 (마지막에 설정)
  app.use(errorMiddleware(logger));
}

export {
  authMiddleware,
  tenantMiddleware,
  rateLimitMiddleware,
  proxyMiddleware,
  errorMiddleware,
  corsMiddleware,
  commonMiddleware
};

