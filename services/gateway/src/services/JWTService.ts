import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWTConfig, JWTPayload, User, RefreshToken, TokenBlacklist, AuthErrorCode } from '../types/auth';
import { Logger } from '@shared/common-libs';
import { Redis } from 'ioredis';

export class JWTService {
  private logger: Logger;
  private config: JWTConfig;
  private redis?: Redis;
  private memoryBlacklist: Set<string> = new Set();

  constructor(logger: Logger, config: JWTConfig, redis?: Redis) {
    this.logger = logger;
    this.config = config;
    this.redis = redis;

    if (config.blacklistStrategy === 'redis' && !redis) {
      this.logger.warn('JWT blacklist strategy is set to Redis but no Redis instance provided. Falling back to memory.');
      this.config.blacklistStrategy = 'memory';
    }
  }

  /**
   * JWT 토큰 생성
   */
  async generateToken(user: User, expiresIn?: string): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
      projectCodes: user.projectCodes,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiration(expiresIn || this.config.expiresIn),
      iss: this.config.issuer,
      aud: this.config.audience
    };

    try {
      const token = this.signToken(payload);
      
      this.logger.info('JWT 토큰 생성', {
        userId: user.id,
        username: user.username,
        expiresAt: new Date(payload.exp * 1000).toISOString()
      });

      return token;
    } catch (error) {
      this.logger.error('JWT 토큰 생성 실패', error);
      throw new Error('Failed to generate JWT token');
    }
  }

  /**
   * Refresh 토큰 생성
   */
  async generateRefreshToken(userId: string, deviceInfo?: { userAgent: string; ip: string; deviceId?: string }): Promise<RefreshToken> {
    if (!this.config.enableRefreshToken) {
      throw new Error('Refresh token is disabled');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + this.parseExpiration(this.config.refreshExpiresIn) * 1000);

    const refreshToken: RefreshToken = {
      id: crypto.randomUUID(),
      userId,
      token,
      hashedToken,
      expiresAt,
      isRevoked: false,
      deviceInfo,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // TODO: 데이터베이스에 저장
    // await this.saveRefreshToken(refreshToken);

    this.logger.info('Refresh 토큰 생성', {
      userId,
      tokenId: refreshToken.id,
      expiresAt: expiresAt.toISOString()
    });

    return refreshToken;
  }

  /**
   * JWT 토큰 검증
   */
  async verifyToken(token: string): Promise<{ valid: boolean; payload?: JWTPayload; error?: AuthErrorCode }> {
    try {
      // 블랙리스트 확인
      if (await this.isTokenBlacklisted(token)) {
        return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
      }

      const payload = this.verifyTokenSignature(token) as JWTPayload;

      // 만료 시간 확인
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: AuthErrorCode.EXPIRED_TOKEN };
      }

      // 발급자 및 대상 확인
      if (payload.iss !== this.config.issuer || payload.aud !== this.config.audience) {
        return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
      }

      return { valid: true, payload };

    } catch (error) {
      this.logger.warn('JWT 토큰 검증 실패', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      if (error instanceof jwt.TokenExpiredError) {
        return { valid: false, error: AuthErrorCode.EXPIRED_TOKEN };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
      }
      
      return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
    }
  }

  /**
   * Refresh 토큰으로 새 JWT 토큰 생성
   */
  async refreshAccessToken(refreshToken: string): Promise<{ success: boolean; accessToken?: string; error?: string }> {
    try {
      // TODO: 데이터베이스에서 refresh 토큰 조회
      const storedToken = await this.getRefreshToken(refreshToken);
      
      if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
        return { success: false, error: 'Invalid or expired refresh token' };
      }

      // TODO: 사용자 정보 조회
      const user = await this.getUserById(storedToken.userId);
      if (!user || !user.isActive) {
        return { success: false, error: 'User not found or inactive' };
      }

      const accessToken = await this.generateToken(user);
      
      // Refresh 토큰 사용 시간 업데이트
      storedToken.updatedAt = new Date();
      // TODO: 데이터베이스 업데이트
      // await this.updateRefreshToken(storedToken);

      this.logger.info('Access 토큰 갱신', {
        userId: user.id,
        refreshTokenId: storedToken.id
      });

      return { success: true, accessToken };

    } catch (error) {
      this.logger.error('토큰 갱신 실패', error);
      return { success: false, error: 'Failed to refresh token' };
    }
  }

  /**
   * 토큰 블랙리스트 추가
   */
  async blacklistToken(token: string, userId: string, reason: 'logout' | 'revoked' | 'security'): Promise<void> {
    try {
      const { payload } = await this.verifyToken(token);
      if (!payload) {
        return; // 이미 유효하지 않은 토큰
      }

      const blacklistEntry: TokenBlacklist = {
        token: this.hashToken(token),
        userId,
        expiresAt: new Date(payload.exp * 1000),
        reason,
        createdAt: new Date()
      };

      switch (this.config.blacklistStrategy) {
        case 'redis':
          if (this.redis) {
            const ttl = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
            await this.redis.setex(`blacklist:${blacklistEntry.token}`, ttl, JSON.stringify(blacklistEntry));
          }
          break;
        
        case 'memory':
          this.memoryBlacklist.add(blacklistEntry.token);
          // 메모리에서 만료된 토큰 정리
          setTimeout(() => {
            this.memoryBlacklist.delete(blacklistEntry.token);
          }, (payload.exp - Math.floor(Date.now() / 1000)) * 1000);
          break;
      }

      this.logger.info('토큰 블랙리스트 추가', {
        userId,
        reason,
        expiresAt: blacklistEntry.expiresAt.toISOString()
      });

    } catch (error) {
      this.logger.error('토큰 블랙리스트 추가 실패', error);
      throw error;
    }
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   */
  private async isTokenBlacklisted(token: string): Promise<boolean> {
    const hashedToken = this.hashToken(token);

    switch (this.config.blacklistStrategy) {
      case 'redis':
        if (this.redis) {
          const exists = await this.redis.exists(`blacklist:${hashedToken}`);
          return exists === 1;
        }
        return false;

      case 'memory':
        return this.memoryBlacklist.has(hashedToken);

      default:
        return false;
    }
  }

  /**
   * 사용자의 모든 토큰 무효화 (로그아웃, 보안 조치)
   */
  async invalidateAllUserTokens(userId: string, reason: 'logout' | 'security' = 'logout'): Promise<void> {
    try {
      // TODO: 해당 사용자의 모든 refresh 토큰 무효화
      // await this.revokeAllRefreshTokens(userId);

      // 현재 진행 중인 JWT 토큰들을 무효화하기 위해 사용자별 블랙리스트 키 생성
      if (this.config.blacklistStrategy === 'redis' && this.redis) {
        const blacklistKey = `user_blacklist:${userId}:${Date.now()}`;
        await this.redis.setex(blacklistKey, this.parseExpiration(this.config.expiresIn), 'true');
      }

      this.logger.info('사용자 모든 토큰 무효화', { userId, reason });

    } catch (error) {
      this.logger.error('사용자 토큰 무효화 실패', error);
      throw error;
    }
  }

  /**
   * 토큰에서 사용자 정보 추출 (검증 없이)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * 토큰의 남은 유효 시간 조회 (초)
   */
  getTokenTTL(token: string): number {
    const payload = this.decodeToken(token);
    if (!payload) {
      return 0;
    }
    
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, payload.exp - now);
  }

  /**
   * JWT 토큰 서명
   */
  private signToken(payload: JWTPayload): string {
    const key = this.config.privateKey || this.config.secret;
    return jwt.sign(payload, key, {
      algorithm: this.config.algorithm
    });
  }

  /**
   * JWT 토큰 서명 검증
   */
  private verifyTokenSignature(token: string): JWTPayload {
    const key = this.config.publicKey || this.config.secret;
    return jwt.verify(token, key, {
      algorithms: [this.config.algorithm]
    }) as JWTPayload;
  }

  /**
   * 만료 시간 파싱 (문자열을 초로 변환)
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
      throw new Error(`Invalid expiration format: ${expiresIn}`);
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  /**
   * 토큰 해시 생성 (블랙리스트용)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Refresh 토큰 조회 (TODO: 실제 데이터베이스 연동)
   */
  private async getRefreshToken(token: string): Promise<RefreshToken | null> {
    // TODO: 데이터베이스에서 refresh 토큰 조회
    return null;
  }

  /**
   * 사용자 조회 (TODO: 실제 사용자 서비스 연동)
   */
  private async getUserById(userId: string): Promise<User | null> {
    // TODO: 사용자 서비스에서 사용자 정보 조회
    return null;
  }

  /**
   * 토큰 통계 조회
   */
  getTokenStats(): {
    blacklistedTokens: number;
    strategy: string;
  } {
    return {
      blacklistedTokens: this.config.blacklistStrategy === 'memory' 
        ? this.memoryBlacklist.size 
        : 0, // Redis의 경우 별도 카운트 필요
      strategy: this.config.blacklistStrategy
    };
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.memoryBlacklist.clear();
    this.logger.info('JWTService 종료');
  }
}