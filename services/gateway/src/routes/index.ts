import { Application, Router } from 'express';
import { authRoutes } from './authRoutes';
import { tenantRoutes } from './tenantRoutes';
import { routingRoutes } from './routingRoutes';

export interface RouteConfig {
  serviceRegistry: any;
  config: any;
  logger: any;
}

/**
 * 모든 라우트를 설정하는 함수
 */
export function setupRoutes(app: Application, config: RouteConfig): void {
  const { serviceRegistry, config: appConfig, logger } = config;

  // API 라우터 생성
  const apiRouter = Router();

  // 인증 라우트
  apiRouter.use('/auth', authRoutes(appConfig, logger));

  // 테넌트 라우트
  apiRouter.use('/tenants', tenantRoutes(appConfig, logger));

  // 라우팅 라우트
  apiRouter.use('/routing', routingRoutes(serviceRegistry, appConfig, logger));

  // API 라우트를 앱에 마운트
  app.use('/api/v1', apiRouter);

  // 서비스별 프록시 라우트
  setupServiceProxyRoutes(app, serviceRegistry, appConfig, logger);
}

/**
 * 서비스별 프록시 라우트 설정
 */
function setupServiceProxyRoutes(
  app: Application, 
  serviceRegistry: any, 
  config: any, 
  logger: any
): void {
  // Auth Service 프록시
  app.use('/api/auth/*', (req, res, next) => {
    const authService = serviceRegistry.getService('auth-service');
    if (authService) {
      req.url = req.url.replace('/api/auth', '');
      authService.proxy(req, res, next);
    } else {
      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Auth service is not available'
      });
    }
  });

  // PMIS Service 프록시
  app.use('/api/pmis/*', (req, res, next) => {
    const pmisService = serviceRegistry.getService('pmis-service');
    if (pmisService) {
      req.url = req.url.replace('/api/pmis', '');
      pmisService.proxy(req, res, next);
    } else {
      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'PMIS service is not available'
      });
    }
  });

  // Billing Service 프록시
  app.use('/api/billing/*', (req, res, next) => {
    const billingService = serviceRegistry.getService('billing-service');
    if (billingService) {
      req.url = req.url.replace('/api/billing', '');
      billingService.proxy(req, res, next);
    } else {
      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Billing service is not available'
      });
    }
  });

  logger.info('서비스 프록시 라우트 설정 완료');
}

export {
  authRoutes,
  tenantRoutes,
  routingRoutes
};

