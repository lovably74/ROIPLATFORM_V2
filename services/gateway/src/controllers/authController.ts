import { Request, Response } from 'express';
import { AuthenticationService } from '../services/AuthenticationService';
import { ApiKeyService } from '../services/ApiKeyService';
import { Logger } from '@shared/common-libs';

export class AuthController {
  constructor(
    private authService: AuthenticationService,
    private apiKeyService: ApiKeyService,
    private logger: Logger
  ) {}

  /**
   * 사용자 로그인
   */
  login = async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Username and password are required'
        });
      }

      const deviceInfo = {
        userAgent: req.headers['user-agent'] || '',
        ip: req.ip,
        deviceId: req.headers['x-device-id'] as string
      };

      const result = await this.authService.login(
        { username, password },
        deviceInfo
      );

      if (!result.success) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: result.error
        });
      }

      res.json({
        message: 'Login successful',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        user: {
          id: result.user!.id,
          username: result.user!.username,
          email: result.user!.email,
          roles: result.user!.roles,
          tenantId: result.user!.tenantId,
          projectCodes: result.user!.projectCodes
        }
      });

    } catch (error) {
      this.logger.error('로그인 처리 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Login processing failed'
      });
    }
  };

  /**
   * 사용자 로그아웃
   */
  logout = async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Authorization header is required'
        });
      }

      const token = authHeader.substring(7);
      const userId = req.auth?.user?.id;

      const result = await this.authService.logout(token, userId);
      
      if (!result.success) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: result.error
        });
      }

      res.json({
        message: 'Logout successful'
      });

    } catch (error) {
      this.logger.error('로그아웃 처리 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Logout processing failed'
      });
    }
  };

  /**
   * 토큰 갱신
   */
  refreshToken = async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required'
        });
      }

      const result = await this.authService.refreshToken(refreshToken);
      
      if (!result.success) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: result.error
        });
      }

      res.json({
        message: 'Token refreshed successfully',
        accessToken: result.accessToken,
        expiresAt: result.expiresAt
      });

    } catch (error) {
      this.logger.error('토큰 갱신 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Token refresh failed'
      });
    }
  };

  /**
   * 현재 사용자 정보 조회
   */
  getProfile = async (req: Request, res: Response) => {
    try {
      if (!req.auth || !req.auth.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const user = req.auth.user;
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        tenantId: user.tenantId,
        projectCodes: user.projectCodes,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt
      });

    } catch (error) {
      this.logger.error('프로필 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Profile retrieval failed'
      });
    }
  };

  /**
   * API 키 생성
   */
  createApiKey = async (req: Request, res: Response) => {
    try {
      const { name, permissions, expiresAt, rateLimit } = req.body;
      const userId = req.auth?.user?.id;
      const tenantId = req.auth?.user?.tenantId;
      const projectCodes = req.auth?.user?.projectCodes;

      if (!name) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'API key name is required'
        });
      }

      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Permissions array is required'
        });
      }

      const apiKey = await this.apiKeyService.generateApiKey({
        name,
        userId,
        tenantId,
        projectCodes,
        permissions,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        rateLimit
      });

      res.status(201).json({
        message: 'API key created successfully',
        apiKey: {
          id: apiKey.id,
          key: apiKey.key, // 생성 시에만 반환
          name: apiKey.name,
          permissions: apiKey.permissions,
          expiresAt: apiKey.expiresAt,
          rateLimit: apiKey.rateLimit,
          createdAt: apiKey.createdAt
        }
      });

    } catch (error) {
      this.logger.error('API 키 생성 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key creation failed'
      });
    }
  };

  /**
   * 사용자의 API 키 목록 조회
   */
  getApiKeys = async (req: Request, res: Response) => {
    try {
      const userId = req.auth?.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      const apiKeys = await this.apiKeyService.getUserApiKeys(userId);
      
      // 보안을 위해 실제 키 값은 제외하고 반환
      const safeApiKeys = apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        permissions: key.permissions,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        rateLimit: key.rateLimit
      }));

      res.json({
        apiKeys: safeApiKeys,
        count: safeApiKeys.length
      });

    } catch (error) {
      this.logger.error('API 키 목록 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API keys retrieval failed'
      });
    }
  };

  /**
   * API 키 활성화/비활성화
   */
  toggleApiKey = async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'isActive field must be a boolean'
        });
      }

      const success = await this.apiKeyService.toggleApiKey(keyId, isActive);
      
      if (!success) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'API key not found'
        });
      }

      res.json({
        message: `API key ${isActive ? 'activated' : 'deactivated'} successfully`,
        keyId,
        isActive
      });

    } catch (error) {
      this.logger.error('API 키 상태 변경 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key toggle failed'
      });
    }
  };

  /**
   * API 키 삭제
   */
  revokeApiKey = async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      
      const success = await this.apiKeyService.revokeApiKey(keyId);
      
      if (!success) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'API key not found'
        });
      }

      res.json({
        message: 'API key revoked successfully',
        keyId
      });

    } catch (error) {
      this.logger.error('API 키 삭제 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key revocation failed'
      });
    }
  };

  /**
   * API 키 로테이션
   */
  rotateApiKey = async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      
      const result = await this.apiKeyService.rotateApiKey(keyId);
      
      if (!result.success) {
        return res.status(404).json({
          error: 'Not Found',
          message: result.error
        });
      }

      res.json({
        message: 'API key rotated successfully',
        keyId,
        newKey: result.newKey // 로테이션 시에만 새 키 반환
      });

    } catch (error) {
      this.logger.error('API 키 로테이션 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API key rotation failed'
      });
    }
  };

  /**
   * 인증 통계 조회
   */
  getAuthStats = async (req: Request, res: Response) => {
    try {
      const stats = this.authService.getAuthStats();
      
      res.json({
        authentication: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('인증 통계 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication stats retrieval failed'
      });
    }
  };

  /**
   * 토큰 검증 (외부 서비스용)
   */
  validateToken = async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Authorization header is required'
        });
      }

      const token = authHeader.substring(7);
      const authResult = await this.authService.authenticate(req);
      
      if (!authResult.success) {
        return res.status(401).json({
          valid: false,
          error: authResult.error,
          code: authResult.errorCode
        });
      }

      res.json({
        valid: true,
        user: {
          id: authResult.user!.id,
          username: authResult.user!.username,
          roles: authResult.user!.roles,
          permissions: authResult.user!.permissions,
          tenantId: authResult.user!.tenantId,
          projectCodes: authResult.user!.projectCodes
        }
      });

    } catch (error) {
      this.logger.error('토큰 검증 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Token validation failed'
      });
    }
  };
}