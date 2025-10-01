import { Request, Response, NextFunction } from 'express';
import { RouterService } from '../services/RouterService';
import { ProxyService } from '../services/ProxyService';
import { Logger } from '@shared/common-libs';

export interface ProxyMiddlewareOptions {
  routerService: RouterService;
  proxyService: ProxyService;
  logger: Logger;
}

export function createProxyMiddleware(options: ProxyMiddlewareOptions) {
  const { routerService, proxyService, logger } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 라우팅 규칙에 매치되는지 확인
      const routeMatch = await routerService.findRoute(req);
      
      if (!routeMatch) {
        // 매치되는 라우팅 규칙이 없으면 다음 미들웨어로 넘김
        return next();
      }

      // 프록시 처리
      await proxyService.proxyRequest(req, res, routeMatch);
      
    } catch (error) {
      logger.error('프록시 미들웨어 오류', {
        path: req.path,
        method: req.method,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Gateway proxy error'
        });
      }
    }
  };
}