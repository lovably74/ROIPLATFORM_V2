import { Router } from 'express';
import { TenantController } from '../controllers/tenantController';
import { createTenantMiddleware, requireTenantFeature } from '../middlewares/tenantMiddleware';

export function createTenantRoutes(
  tenantController: TenantController, 
  tenantMiddleware: ReturnType<typeof createTenantMiddleware>
): Router {
  const router = Router();

  // 테넌트 컨텍스트가 필요한 엔드포인트
  router.get('/current', tenantMiddleware, tenantController.getCurrentTenant);
  router.get('/features', tenantMiddleware, tenantController.getTenantFeatures);
  router.get('/quotas', tenantMiddleware, tenantController.getTenantQuotas);
  router.get('/settings', tenantMiddleware, tenantController.getTenantSettings);
  router.get('/projects', tenantMiddleware, tenantController.getTenantProjects);

  // 관리자 전용 엔드포인트 (테넌트 컨텍스트 없이)
  router.get('/stats', tenantController.getTenantStats);
  router.delete('/cache', tenantController.clearTenantCache);

  // 유틸리티 엔드포인트
  router.post('/validate', tenantController.validateTenant);
  router.get('/test-resolution', tenantController.testTenantResolution);

  return router;
}