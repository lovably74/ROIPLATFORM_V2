import { Router } from 'express';
import { RoutingController } from '../controllers/routingController';

export function createRoutingRoutes(routingController: RoutingController): Router {
  const router = Router();

  // 서비스 관리
  router.post('/services', routingController.registerService);
  router.get('/services', routingController.getServices);
  router.get('/services/:serviceName', routingController.getService);
  router.delete('/services/:serviceName', routingController.unregisterService);

  // 라우팅 규칙 관리
  router.post('/rules', routingController.addRoutingRule);
  router.get('/rules', routingController.getRoutingRules);
  router.put('/rules/:ruleId', routingController.updateRoutingRule);
  router.delete('/rules/:ruleId', routingController.deleteRoutingRule);
  router.patch('/rules/:ruleId/toggle', routingController.toggleRoutingRule);

  // 통계 및 모니터링
  router.get('/stats', routingController.getStats);
  router.post('/circuit-breakers/:endpointId/reset', routingController.resetCircuitBreaker);

  return router;
}