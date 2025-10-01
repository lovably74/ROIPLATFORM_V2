import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { createAuthMiddleware, requirePermissions } from '../middlewares/authMiddleware';

export function createAuthRoutes(authController: AuthController, authMiddleware: ReturnType<typeof createAuthMiddleware>): Router {
  const router = Router();

  // 공개 엔드포인트 (인증 불필요)
  router.post('/login', authController.login);
  router.post('/refresh', authController.refreshToken);
  router.post('/validate', authController.validateToken);

  // 인증이 필요한 엔드포인트
  router.post('/logout', authMiddleware, authController.logout);
  router.get('/profile', authMiddleware, authController.getProfile);

  // API 키 관리 (인증 + 권한 필요)
  router.post('/api-keys', authMiddleware, requirePermissions(['api_key:create']), authController.createApiKey);
  router.get('/api-keys', authMiddleware, authController.getApiKeys);
  router.patch('/api-keys/:keyId/toggle', authMiddleware, requirePermissions(['api_key:manage']), authController.toggleApiKey);
  router.delete('/api-keys/:keyId', authMiddleware, requirePermissions(['api_key:delete']), authController.revokeApiKey);
  router.post('/api-keys/:keyId/rotate', authMiddleware, requirePermissions(['api_key:rotate']), authController.rotateApiKey);

  // 관리자 전용 엔드포인트
  router.get('/stats', authMiddleware, requirePermissions(['auth:stats']), authController.getAuthStats);

  return router;
}