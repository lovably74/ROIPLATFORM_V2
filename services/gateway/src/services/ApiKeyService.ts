import crypto from 'crypto';
import { ApiKeyConfig, ApiKey, AuthErrorCode, User } from '../types/auth';
import { Logger } from '@shared/common-libs';
import { Redis } from 'ioredis';

export class ApiKeyService {
  private logger: Logger;
  private config: ApiKeyConfig;
  private redis?: Redis;
  private memoryStore: Map<string, ApiKey> = new Map();

  constructor(logger: Logger, config: ApiKeyConfig, redis?: Redis) {
    this.logger = logger;
    this.config = config;
    this.redis = redis;

    if (config.storage === 'redis' && !redis) {
      this.logger.warn('API Key storage is set to Redis but no Redis instance provided. Falling back to memory.');
      this.config.storage = 'database';
    }

    // API 키 로테이션 스케줄링
    if (config.enableRotation) {
      this.scheduleRotation();
    }
  }

  /**
   * 새 API 키 생성
   */
  async generateApiKey(options: {
    name: string;
    userId?: string;
    tenantId?: string;
    projectCodes?: string[];
    permissions: string[];
    expiresAt?: Date;
    rateLimit?: {
      requests: number;
      windowMs: number;
    };
  }): Promise<ApiKey> {
    const rawKey = this.generateSecureKey();
    const hashedKey = this.hashKey(rawKey);

    const apiKey: ApiKey = {
      id: crypto.randomUUID(),
      key: rawKey,
      hashedKey,
      name: options.name,
      userId: options.userId,
      tenantId: options.tenantId,
      projectCodes: options.projectCodes,
      permissions: options.permissions,
      rateLimit: options.rateLimit,
      isActive: true,
      expiresAt: options.expiresAt,
      lastUsedAt: undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.storeApiKey(apiKey);

    this.logger.info('API 키 생성', {
      keyId: apiKey.id,
      name: apiKey.name,
      userId: options.userId,
      tenantId: options.tenantId,
      permissions: options.permissions
    });

    return apiKey;
  }

  /**
   * API 키 검증
   */
  async validateApiKey(key: string): Promise<{ 
    valid: boolean; 
    apiKey?: ApiKey; 
    user?: User;
    error?: AuthErrorCode 
  }> {
    try {
      // 키 형식 검증
      if (this.config.validateFormat && this.config.keyPattern) {
        if (!this.config.keyPattern.test(key)) {
          return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
        }
      }

      const hashedKey = this.hashKey(key);
      const apiKey = await this.getApiKeyByHash(hashedKey);

      if (!apiKey) {
        return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
      }

      // 활성화 상태 확인
      if (!apiKey.isActive) {
        return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
      }

      // 만료 시간 확인
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return { valid: false, error: AuthErrorCode.EXPIRED_TOKEN };
      }

      // 사용 시간 업데이트
      await this.updateLastUsed(apiKey.id);

      // 사용자 정보 조회 (필요한 경우)
      let user: User | undefined;
      if (apiKey.userId) {
        user = await this.getUserById(apiKey.userId);
        if (!user || !user.isActive) {
          return { valid: false, error: AuthErrorCode.USER_INACTIVE };
        }
      }

      this.logger.debug('API 키 검증 성공', {
        keyId: apiKey.id,
        name: apiKey.name,
        userId: apiKey.userId
      });

      return { valid: true, apiKey, user };

    } catch (error) {
      this.logger.error('API 키 검증 실패', error);
      return { valid: false, error: AuthErrorCode.INVALID_TOKEN };
    }
  }

  /**
   * API 키 비활성화/활성화
   */
  async toggleApiKey(keyId: string, isActive: boolean): Promise<boolean> {
    try {
      const apiKey = await this.getApiKeyById(keyId);
      if (!apiKey) {
        return false;
      }

      apiKey.isActive = isActive;
      apiKey.updatedAt = new Date();

      await this.updateApiKey(apiKey);

      this.logger.info(`API 키 ${isActive ? '활성화' : '비활성화'}`, {
        keyId,
        name: apiKey.name
      });

      return true;
    } catch (error) {
      this.logger.error('API 키 상태 변경 실패', error);
      return false;
    }
  }

  /**
   * API 키 삭제
   */
  async revokeApiKey(keyId: string): Promise<boolean> {
    try {
      const apiKey = await this.getApiKeyById(keyId);
      if (!apiKey) {
        return false;
      }

      await this.deleteApiKey(keyId);

      this.logger.info('API 키 삭제', {
        keyId,
        name: apiKey.name
      });

      return true;
    } catch (error) {
      this.logger.error('API 키 삭제 실패', error);
      return false;
    }
  }

  /**
   * API 키 로테이션
   */
  async rotateApiKey(keyId: string): Promise<{ success: boolean; newKey?: string; error?: string }> {
    try {
      const apiKey = await this.getApiKeyById(keyId);
      if (!apiKey) {
        return { success: false, error: 'API key not found' };
      }

      const newRawKey = this.generateSecureKey();
      const newHashedKey = this.hashKey(newRawKey);

      // 기존 키를 새 키로 업데이트
      apiKey.key = newRawKey;
      apiKey.hashedKey = newHashedKey;
      apiKey.updatedAt = new Date();

      await this.updateApiKey(apiKey);

      this.logger.info('API 키 로테이션', {
        keyId,
        name: apiKey.name
      });

      return { success: true, newKey: newRawKey };

    } catch (error) {
      this.logger.error('API 키 로테이션 실패', error);
      return { success: false, error: 'Failed to rotate API key' };
    }
  }

  /**
   * 사용자의 모든 API 키 조회
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    try {
      // TODO: 데이터베이스에서 사용자의 API 키들 조회
      return [];
    } catch (error) {
      this.logger.error('사용자 API 키 조회 실패', error);
      return [];
    }
  }

  /**
   * 테넌트의 모든 API 키 조회
   */
  async getTenantApiKeys(tenantId: string): Promise<ApiKey[]> {
    try {
      // TODO: 데이터베이스에서 테넌트의 API 키들 조회
      return [];
    } catch (error) {
      this.logger.error('테넌트 API 키 조회 실패', error);
      return [];
    }
  }

  /**
   * API 키 사용량 통계
   */
  async getApiKeyStats(keyId: string): Promise<{
    totalRequests: number;
    lastUsed?: Date;
    averageRequestsPerDay: number;
  } | null> {
    try {
      const apiKey = await this.getApiKeyById(keyId);
      if (!apiKey) {
        return null;
      }

      // TODO: 실제 사용량 통계 구현
      return {
        totalRequests: 0,
        lastUsed: apiKey.lastUsedAt,
        averageRequestsPerDay: 0
      };
    } catch (error) {
      this.logger.error('API 키 통계 조회 실패', error);
      return null;
    }
  }

  /**
   * 보안 키 생성
   */
  private generateSecureKey(): string {
    const prefix = 'roi_';
    const randomBytes = crypto.randomBytes(24).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return `${prefix}${randomBytes}`;
  }

  /**
   * 키 해시 생성
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * API 키 저장
   */
  private async storeApiKey(apiKey: ApiKey): Promise<void> {
    switch (this.config.storage) {
      case 'redis':
        if (this.redis) {
          const data = JSON.stringify({
            ...apiKey,
            key: undefined // 원본 키는 저장하지 않음
          });
          await this.redis.setex(`apikey:${apiKey.hashedKey}`, 86400 * 365, data); // 1년
        }
        break;

      case 'database':
        // TODO: 데이터베이스에 저장
        this.memoryStore.set(apiKey.hashedKey, {
          ...apiKey,
          key: apiKey.key // 메모리에는 임시로 원본 키도 보관
        });
        break;
    }
  }

  /**
   * 해시로 API 키 조회
   */
  private async getApiKeyByHash(hashedKey: string): Promise<ApiKey | null> {
    switch (this.config.storage) {
      case 'redis':
        if (this.redis) {
          const data = await this.redis.get(`apikey:${hashedKey}`);
          if (data) {
            return JSON.parse(data) as ApiKey;
          }
        }
        break;

      case 'database':
        // TODO: 데이터베이스에서 조회
        return this.memoryStore.get(hashedKey) || null;
    }

    return null;
  }

  /**
   * ID로 API 키 조회
   */
  private async getApiKeyById(keyId: string): Promise<ApiKey | null> {
    // TODO: 데이터베이스에서 ID로 조회
    for (const apiKey of this.memoryStore.values()) {
      if (apiKey.id === keyId) {
        return apiKey;
      }
    }
    return null;
  }

  /**
   * API 키 업데이트
   */
  private async updateApiKey(apiKey: ApiKey): Promise<void> {
    switch (this.config.storage) {
      case 'redis':
        if (this.redis) {
          const data = JSON.stringify({
            ...apiKey,
            key: undefined
          });
          await this.redis.setex(`apikey:${apiKey.hashedKey}`, 86400 * 365, data);
        }
        break;

      case 'database':
        // TODO: 데이터베이스에 업데이트
        this.memoryStore.set(apiKey.hashedKey, apiKey);
        break;
    }
  }

  /**
   * 마지막 사용 시간 업데이트
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    const apiKey = await this.getApiKeyById(keyId);
    if (apiKey) {
      apiKey.lastUsedAt = new Date();
      await this.updateApiKey(apiKey);
    }
  }

  /**
   * API 키 삭제
   */
  private async deleteApiKey(keyId: string): Promise<void> {
    const apiKey = await this.getApiKeyById(keyId);
    if (!apiKey) {
      return;
    }

    switch (this.config.storage) {
      case 'redis':
        if (this.redis) {
          await this.redis.del(`apikey:${apiKey.hashedKey}`);
        }
        break;

      case 'database':
        // TODO: 데이터베이스에서 삭제
        this.memoryStore.delete(apiKey.hashedKey);
        break;
    }
  }

  /**
   * 사용자 조회 (TODO: 실제 사용자 서비스 연동)
   */
  private async getUserById(userId: string): Promise<User | null> {
    // TODO: 사용자 서비스에서 사용자 정보 조회
    return null;
  }

  /**
   * 자동 로테이션 스케줄링
   */
  private scheduleRotation(): void {
    setInterval(async () => {
      try {
        await this.performAutomaticRotation();
      } catch (error) {
        this.logger.error('자동 API 키 로테이션 실패', error);
      }
    }, this.config.rotationPeriod);
  }

  /**
   * 자동 로테이션 수행
   */
  private async performAutomaticRotation(): Promise<void> {
    this.logger.info('자동 API 키 로테이션 시작');
    
    // TODO: 로테이션이 필요한 키들 조회 및 처리
    // 1. 오래된 키들 찾기
    // 2. 각 키별로 로테이션 수행
    // 3. 알림 발송 (이메일 등)
  }

  /**
   * API 키 통계 조회
   */
  getStats(): {
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    storageType: string;
  } {
    let totalKeys = 0;
    let activeKeys = 0;
    let expiredKeys = 0;

    // 메모리 저장소에서 통계 계산
    const now = new Date();
    for (const apiKey of this.memoryStore.values()) {
      totalKeys++;
      if (apiKey.isActive && (!apiKey.expiresAt || apiKey.expiresAt > now)) {
        activeKeys++;
      } else if (apiKey.expiresAt && apiKey.expiresAt <= now) {
        expiredKeys++;
      }
    }

    return {
      totalKeys,
      activeKeys,
      expiredKeys,
      storageType: this.config.storage
    };
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.memoryStore.clear();
    this.logger.info('ApiKeyService 종료');
  }
}