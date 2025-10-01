import { Request } from 'express';
import { 
  AuthConfig, 
  AuthMethod, 
  AuthenticationResult, 
  AuthorizationResult, 
  AuthContext,
  AuthErrorCode,
  User,
  Permission
} from '../types/auth';
import { JWTService } from './JWTService';
import { ApiKeyService } from './ApiKeyService';
import { Logger } from '@shared/common-libs';
import { Redis } from 'ioredis';

export class AuthenticationService {
  private logger: Logger;
  private config: AuthConfig;
  private jwtService: JWTService;
  private apiKeyService: ApiKeyService;
  private redis?: Redis;

  constructor(logger: Logger, config: AuthConfig, redis?: Redis) {
    this.logger = logger;
    this.config = config;
    this.redis = redis;

    // 개별 인증 서비스 초기화
    this.jwtService = new JWTService(logger, config.jwt, redis);
    this.apiKeyService = new ApiKeyService(logger, config.apiKey, redis);
  }

  /**
   * 요청에서 인증 정보 추출 및 검증
   */
  async authenticate(req: Request): Promise<AuthenticationResult> {
    try {
      // 다양한 인증 방법 시도
      const authMethods = this.detectAuthMethods(req);
      
      for (const method of authMethods) {
        const result = await this.tryAuthentication(req, method);
        if (result.success) {
          // 감사 로그 기록
          if (this.config.security.enableAuditLogging) {
            await this.logAuthEvent(req, result, true);
          }
          return result;
        }
      }

      // 모든 인증 방법 실패
      const failureResult: AuthenticationResult = {
        success: false,
        error: 'Authentication failed',
        errorCode: AuthErrorCode.MISSING_TOKEN
      };

      if (this.config.security.enableAuditLogging) {
        await this.logAuthEvent(req, failureResult, false);
      }

      return failureResult;

    } catch (error) {
      this.logger.error('인증 처리 중 오류 발생', error);
      return {
        success: false,
        error: 'Authentication error',
        errorCode: AuthErrorCode.INVALID_TOKEN
      };
    }
  }

  /**
   * 사용자 권한 검증
   */
  async authorize(
    authContext: AuthContext, 
    requiredPermissions: string[],
    resource?: string,
    action?: string
  ): Promise<AuthorizationResult> {
    try {
      const { user, tenantId, projectCodes } = authContext;

      // 사용자 활성화 상태 확인
      if (!user.isActive) {
        return {
          allowed: false,
          user,
          error: 'User is inactive',
          requiredPermissions
        };
      }

      // 테넌트 일치 확인
      if (tenantId && user.tenantId && user.tenantId !== tenantId) {
        return {
          allowed: false,
          user,
          error: 'Tenant mismatch',
          requiredPermissions
        };
      }

      // 프로젝트 코드 확인
      if (projectCodes && user.projectCodes) {
        const hasProjectAccess = projectCodes.some(pc => 
          user.projectCodes!.includes(pc)
        );
        if (!hasProjectAccess) {
          return {
            allowed: false,
            user,
            error: 'Project access denied',
            requiredPermissions
          };
        }
      }

      // 권한 확인
      const missingPermissions = this.checkPermissions(
        user.permissions, 
        requiredPermissions,
        resource,
        action
      );

      if (missingPermissions.length > 0) {
        return {
          allowed: false,
          user,
          requiredPermissions,
          missingPermissions,
          error: 'Insufficient permissions'
        };
      }

      return {
        allowed: true,
        user,
        requiredPermissions
      };

    } catch (error) {
      this.logger.error('권한 확인 중 오류 발생', error);
      return {
        allowed: false,
        user: authContext.user,
        error: 'Authorization error',
        requiredPermissions
      };
    }
  }

  /**
   * 인증 컨텍스트 생성
   */
  createAuthContext(
    user: User, 
    method: AuthMethod,
    req: Request,
    additionalData?: any
  ): AuthContext {
    return {
      user,
      method,
      token: additionalData?.token,
      session: additionalData?.session,
      apiKey: additionalData?.apiKey,
      permissions: user.permissions,
      tenantId: user.tenantId,
      projectCodes: user.projectCodes,
      requestId: req.headers['x-request-id'] as string || 'unknown',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    };
  }

  /**
   * 로그인 처리
   */
  async login(
    credentials: { username: string; password: string },
    deviceInfo?: { userAgent: string; ip: string; deviceId?: string }
  ): Promise<{ 
    success: boolean; 
    accessToken?: string; 
    refreshToken?: string; 
    user?: User;
    expiresAt?: Date;
    error?: string 
  }> {
    try {
      // 사용자 인증
      const user = await this.validateCredentials(credentials);
      if (!user) {
        return { success: false, error: 'Invalid credentials' };
      }

      if (!user.isActive) {
        return { success: false, error: 'User account is inactive' };
      }

      // JWT 토큰 생성
      const accessToken = await this.jwtService.generateToken(user);
      const expiresAt = new Date(Date.now() + this.parseExpiration(this.config.jwt.expiresIn) * 1000);

      let refreshToken: string | undefined;
      if (this.config.jwt.enableRefreshToken) {
        const refreshTokenObj = await this.jwtService.generateRefreshToken(user.id, deviceInfo);
        refreshToken = refreshTokenObj.token;
      }

      // 마지막 로그인 시간 업데이트
      await this.updateLastLogin(user.id);

      this.logger.info('사용자 로그인 성공', {
        userId: user.id,
        username: user.username,
        ip: deviceInfo?.ip
      });

      return {
        success: true,
        accessToken,
        refreshToken,
        user,
        expiresAt
      };

    } catch (error) {
      this.logger.error('로그인 처리 실패', error);
      return { success: false, error: 'Login failed' };
    }
  }

  /**
   * 로그아웃 처리
   */
  async logout(token: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // JWT 토큰 블랙리스트 추가
      if (userId) {
        await this.jwtService.blacklistToken(token, userId, 'logout');
      }

      this.logger.info('사용자 로그아웃', { userId });
      return { success: true };

    } catch (error) {
      this.logger.error('로그아웃 처리 실패', error);
      return { success: false, error: 'Logout failed' };
    }
  }

  /**
   * 토큰 갱신
   */
  async refreshToken(refreshToken: string): Promise<{
    success: boolean;
    accessToken?: string;
    expiresAt?: Date;
    error?: string;
  }> {
    const result = await this.jwtService.refreshAccessToken(refreshToken);
    
    if (result.success && result.accessToken) {
      const expiresAt = new Date(Date.now() + this.parseExpiration(this.config.jwt.expiresIn) * 1000);
      return {
        success: true,
        accessToken: result.accessToken,
        expiresAt
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * 요청에서 인증 방법 감지
   */
  private detectAuthMethods(req: Request): AuthMethod[] {
    const methods: AuthMethod[] = [];

    // Authorization 헤더 확인
    const authHeader = req.headers.authorization;
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        methods.push(AuthMethod.JWT);
      } else if (authHeader.startsWith('Basic ')) {
        methods.push(AuthMethod.BASIC_AUTH);
      }
    }

    // API Key 확인
    const apiKeyHeader = req.headers[this.config.apiKey.headerName.toLowerCase()];
    const apiKeyQuery = this.config.apiKey.queryParamName 
      ? req.query[this.config.apiKey.queryParamName] 
      : null;
    
    if (apiKeyHeader || apiKeyQuery) {
      methods.push(AuthMethod.API_KEY);
    }

    // 세션 확인
    if (req.session && req.session.userId) {
      methods.push(AuthMethod.SESSION);
    }

    // SSO 토큰 확인 (커스텀 헤더)
    if (req.headers['x-sso-token']) {
      methods.push(AuthMethod.SSO_TOKEN);
    }

    return methods;
  }

  /**
   * 특정 인증 방법으로 인증 시도
   */
  private async tryAuthentication(req: Request, method: AuthMethod): Promise<AuthenticationResult> {
    switch (method) {
      case AuthMethod.JWT:
        return await this.authenticateJWT(req);
      
      case AuthMethod.API_KEY:
        return await this.authenticateApiKey(req);
      
      case AuthMethod.SESSION:
        return await this.authenticateSession(req);
      
      case AuthMethod.SSO_TOKEN:
        return await this.authenticateSSOToken(req);
      
      case AuthMethod.BASIC_AUTH:
        return await this.authenticateBasicAuth(req);
      
      default:
        return {
          success: false,
          error: 'Unsupported authentication method',
          errorCode: AuthErrorCode.INVALID_TOKEN
        };
    }
  }

  /**
   * JWT 인증
   */
  private async authenticateJWT(req: Request): Promise<AuthenticationResult> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'Missing or invalid authorization header',
        errorCode: AuthErrorCode.MISSING_TOKEN
      };
    }

    const token = authHeader.substring(7);
    const verifyResult = await this.jwtService.verifyToken(token);

    if (!verifyResult.valid || !verifyResult.payload) {
      return {
        success: false,
        error: 'Invalid or expired token',
        errorCode: verifyResult.error
      };
    }

    const user = await this.getUserById(verifyResult.payload.sub);
    if (!user) {
      return {
        success: false,
        error: 'User not found',
        errorCode: AuthErrorCode.INVALID_TOKEN
      };
    }

    return {
      success: true,
      user,
      token
    };
  }

  /**
   * API 키 인증
   */
  private async authenticateApiKey(req: Request): Promise<AuthenticationResult> {
    const apiKey = req.headers[this.config.apiKey.headerName.toLowerCase()] as string ||
                  (this.config.apiKey.queryParamName ? req.query[this.config.apiKey.queryParamName] as string : null);

    if (!apiKey) {
      return {
        success: false,
        error: 'Missing API key',
        errorCode: AuthErrorCode.MISSING_TOKEN
      };
    }

    const validateResult = await this.apiKeyService.validateApiKey(apiKey);
    
    if (!validateResult.valid || !validateResult.apiKey) {
      return {
        success: false,
        error: 'Invalid API key',
        errorCode: validateResult.error
      };
    }

    // API 키에 연결된 사용자가 있으면 사용, 없으면 시스템 사용자 생성
    let user = validateResult.user;
    if (!user && validateResult.apiKey.userId) {
      user = await this.getUserById(validateResult.apiKey.userId);
    }
    
    if (!user) {
      // API 키만으로 인증하는 경우 가상 사용자 생성
      user = this.createVirtualUser(validateResult.apiKey);
    }

    return {
      success: true,
      user,
      token: apiKey
    };
  }

  /**
   * 세션 인증
   */
  private async authenticateSession(req: Request): Promise<AuthenticationResult> {
    if (!req.session || !req.session.userId) {
      return {
        success: false,
        error: 'No valid session',
        errorCode: AuthErrorCode.MISSING_TOKEN
      };
    }

    const user = await this.getUserById(req.session.userId);
    if (!user) {
      return {
        success: false,
        error: 'User not found',
        errorCode: AuthErrorCode.INVALID_TOKEN
      };
    }

    return {
      success: true,
      user
    };
  }

  /**
   * SSO 토큰 인증 (간단한 구현)
   */
  private async authenticateSSOToken(req: Request): Promise<AuthenticationResult> {
    const ssoToken = req.headers['x-sso-token'] as string;
    
    if (!ssoToken) {
      return {
        success: false,
        error: 'Missing SSO token',
        errorCode: AuthErrorCode.MISSING_TOKEN
      };
    }

    // TODO: SSO 토큰 검증 로직 구현
    // 실제 환경에서는 외부 SSO 서비스와 연동
    
    return {
      success: false,
      error: 'SSO authentication not implemented',
      errorCode: AuthErrorCode.INVALID_TOKEN
    };
  }

  /**
   * Basic 인증
   */
  private async authenticateBasicAuth(req: Request): Promise<AuthenticationResult> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return {
        success: false,
        error: 'Missing or invalid authorization header',
        errorCode: AuthErrorCode.MISSING_TOKEN
      };
    }

    try {
      const encoded = authHeader.substring(6);
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const [username, password] = decoded.split(':');

      const user = await this.validateCredentials({ username, password });
      if (!user) {
        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS
        };
      }

      return {
        success: true,
        user
      };

    } catch (error) {
      return {
        success: false,
        error: 'Invalid basic auth format',
        errorCode: AuthErrorCode.INVALID_TOKEN
      };
    }
  }

  /**
   * 권한 확인
   */
  private checkPermissions(
    userPermissions: string[],
    requiredPermissions: string[],
    resource?: string,
    action?: string
  ): string[] {
    const missing: string[] = [];

    for (const required of requiredPermissions) {
      if (!userPermissions.includes(required)) {
        // 리소스/액션 기반 권한 확인도 가능
        if (resource && action) {
          const resourcePermission = `${resource}:${action}`;
          const wildcardPermission = `${resource}:*`;
          
          if (!userPermissions.includes(resourcePermission) && 
              !userPermissions.includes(wildcardPermission)) {
            missing.push(required);
          }
        } else {
          missing.push(required);
        }
      }
    }

    return missing;
  }

  /**
   * API 키용 가상 사용자 생성
   */
  private createVirtualUser(apiKey: any): User {
    return {
      id: `apikey:${apiKey.id}`,
      username: `api_${apiKey.name}`,
      email: '',
      roles: ['api_user'],
      permissions: apiKey.permissions,
      tenantId: apiKey.tenantId,
      projectCodes: apiKey.projectCodes,
      isActive: true,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt
    };
  }

  /**
   * 감사 로그 기록
   */
  private async logAuthEvent(
    req: Request, 
    result: AuthenticationResult, 
    success: boolean
  ): Promise<void> {
    // TODO: 실제 감사 로그 저장 구현
    this.logger.info('인증 이벤트', {
      success,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: result.user?.id,
      error: result.error
    });
  }

  /**
   * 사용자 인증 정보 검증 (TODO: 실제 구현)
   */
  private async validateCredentials(credentials: { username: string; password: string }): Promise<User | null> {
    // TODO: 실제 사용자 서비스와 연동하여 인증 처리
    return null;
  }

  /**
   * 사용자 조회 (TODO: 실제 구현)
   */
  private async getUserById(userId: string): Promise<User | null> {
    // TODO: 사용자 서비스에서 사용자 정보 조회
    return null;
  }

  /**
   * 마지막 로그인 시간 업데이트 (TODO: 실제 구현)
   */
  private async updateLastLogin(userId: string): Promise<void> {
    // TODO: 사용자 서비스에서 마지막 로그인 시간 업데이트
  }

  /**
   * 만료 시간 파싱
   */
  private parseExpiration(expiresIn: string): number {
    const units: Record<string, number> = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400,
      'w': 604800
    };

    const match = expiresIn.match(/^(\d+)([smhdw])$/);
    if (!match) {
      return 3600; // 기본 1시간
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  /**
   * 인증 통계 조회
   */
  getAuthStats() {
    return {
      jwt: this.jwtService.getTokenStats(),
      apiKey: this.apiKeyService.getStats()
    };
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.jwtService.destroy();
    this.apiKeyService.destroy();
    this.logger.info('AuthenticationService 종료');
  }
}