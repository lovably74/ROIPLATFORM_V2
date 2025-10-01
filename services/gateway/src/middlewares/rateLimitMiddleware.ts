import { Request, Response, NextFunction } from 'express';
import { Logger } from '@shared/common-libs';
import { Redis } from 'ioredis';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: 'ip' | 'user' | 'tenant' | 'custom';
  customKeyGenerator?: (req: Request) => string;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  store: 'memory' | 'redis';
  enableBurst: boolean;
  burstLimit?: number;
  enableSlowDown: boolean;
  slowDownDelay?: number;
  whitelistedIPs: string[];
  blacklistedIPs: string[];
  headers: {
    total: string;
    remaining: string;
    reset: string;
    retryAfter: string;
  };
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  burstCount?: number;
}

export class RateLimitMiddleware {
  private logger: Logger;
  private config: RateLimitConfig;
  private redis?: Redis;
  private memoryStore: Map<string, RateLimitEntry> = new Map();
  private stats = {
    totalRequests: 0,
    limitedRequests: 0,
    burstRequests: 0
  };

  constructor(logger: Logger, config: RateLimitConfig, redis?: Redis) {
    this.logger = logger;
    this.config = config;
    this.redis = redis;

    if (config.store === 'redis' && !redis) {
      this.logger.warn('Rate limit store set to Redis but no Redis instance provided. Falling back to memory.');
      this.config.store = 'memory';
    }

    // 주기적으로 만료된 메모리 엔트리 정리
    if (this.config.store === 'memory') {
      setInterval(() => this.cleanupMemoryStore(), 60000); // 1분마다
    }
  }

  /**
   * Rate Limiting 미들웨어 생성
   */
  createRateLimitMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // IP 화이트리스트/블랙리스트 확인
        const clientIP = this.getClientIP(req);
        
        if (this.isWhitelisted(clientIP)) {
          return next();
        }

        if (this.isBlacklisted(clientIP)) {
          return this.sendRateLimitResponse(res, {
            error: 'IP Blacklisted',
            message: 'Your IP address has been blocked',
            retryAfter: null
          });
        }

        // Rate limit 키 생성
        const key = this.generateKey(req);
        
        // 현재 요청 수 확인 및 업데이트
        const result = await this.checkAndUpdateLimit(key);
        
        this.stats.totalRequests++;

        // Rate limit 초과 확인
        if (result.limited) {
          this.stats.limitedRequests++;
          
          this.logger.warn('Rate limit 초과', {
            key,
            count: result.count,
            limit: result.limit,
            resetTime: new Date(result.resetTime).toISOString(),
            ip: clientIP,
            userAgent: req.headers['user-agent']
          });

          return this.sendRateLimitResponse(res, {
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
          });
        }

        // Rate limit 헤더 설정
        this.setRateLimitHeaders(res, result);

        // Slow down 처리
        if (this.config.enableSlowDown && result.slowDown) {
          await this.delay(this.config.slowDownDelay || 1000);
        }

        next();

      } catch (error) {
        this.logger.error('Rate limit 처리 중 오류', error);
        // 오류 발생 시 요청을 통과시킴 (fail-open)
        next();
      }
    };
  }

  /**
   * 현재 제한 상태 확인 및 업데이트
   */
  private async checkAndUpdateLimit(key: string): Promise<{
    limited: boolean;
    count: number;
    limit: number;
    resetTime: number;
    remaining: number;
    slowDown: boolean;
  }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry: RateLimitEntry;

    if (this.config.store === 'redis' && this.redis) {
      entry = await this.getRedisEntry(key, now);
    } else {
      entry = this.getMemoryEntry(key, now);
    }

    // 요청 수 증가
    entry.count++;

    // Burst 처리
    let burstLimited = false;
    if (this.config.enableBurst && this.config.burstLimit) {
      entry.burstCount = (entry.burstCount || 0) + 1;
      if (entry.burstCount > this.config.burstLimit) {
        burstLimited = true;
        this.stats.burstRequests++;
      }
    }

    // 업데이트된 엔트리 저장
    if (this.config.store === 'redis' && this.redis) {
      await this.setRedisEntry(key, entry);
    } else {
      this.setMemoryEntry(key, entry);
    }

    const limited = entry.count > this.config.maxRequests || burstLimited;
    const slowDown = this.config.enableSlowDown && entry.count > (this.config.maxRequests * 0.8);

    return {
      limited,
      count: entry.count,
      limit: this.config.maxRequests,
      resetTime: entry.resetTime,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      slowDown
    };
  }

  /**
   * Redis에서 엔트리 조회
   */
  private async getRedisEntry(key: string, now: number): Promise<RateLimitEntry> {
    try {
      const data = await this.redis!.get(`ratelimit:${key}`);
      if (data) {
        const entry = JSON.parse(data) as RateLimitEntry;
        if (entry.resetTime > now) {
          return entry;
        }
      }
    } catch (error) {
      this.logger.warn('Redis rate limit 조회 실패', error);
    }

    return {
      count: 0,
      resetTime: now + this.config.windowMs,
      burstCount: 0
    };
  }

  /**
   * Redis에 엔트리 저장
   */
  private async setRedisEntry(key: string, entry: RateLimitEntry): Promise<void> {
    try {
      const ttl = Math.ceil((entry.resetTime - Date.now()) / 1000);
      await this.redis!.setex(
        `ratelimit:${key}`,
        Math.max(1, ttl),
        JSON.stringify(entry)
      );
    } catch (error) {
      this.logger.warn('Redis rate limit 저장 실패', error);
    }
  }

  /**
   * 메모리에서 엔트리 조회
   */
  private getMemoryEntry(key: string, now: number): RateLimitEntry {
    const existing = this.memoryStore.get(key);
    if (existing && existing.resetTime > now) {
      return existing;
    }

    return {
      count: 0,
      resetTime: now + this.config.windowMs,
      burstCount: 0
    };
  }

  /**
   * 메모리에 엔트리 저장
   */
  private setMemoryEntry(key: string, entry: RateLimitEntry): void {
    this.memoryStore.set(key, entry);
  }

  /**
   * Rate limit 키 생성
   */
  private generateKey(req: Request): string {
    switch (this.config.keyGenerator) {
      case 'ip':
        return `ip:${this.getClientIP(req)}`;
      
      case 'user':
        const userId = req.auth?.user?.id || req.user?.id;
        return userId ? `user:${userId}` : `ip:${this.getClientIP(req)}`;
      
      case 'tenant':
        const tenantId = req.tenant?.tenantId || req.tenantId;
        return tenantId ? `tenant:${tenantId}` : `ip:${this.getClientIP(req)}`;
      
      case 'custom':
        if (this.config.customKeyGenerator) {
          return this.config.customKeyGenerator(req);
        }
        return `ip:${this.getClientIP(req)}`;
      
      default:
        return `ip:${this.getClientIP(req)}`;
    }
  }

  /**
   * 클라이언트 IP 추출
   */
  private getClientIP(req: Request): string {
    return req.ip || 
           (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           (req.headers['x-real-ip'] as string) ||
           req.connection.remoteAddress ||
           '127.0.0.1';
  }

  /**
   * IP 화이트리스트 확인
   */
  private isWhitelisted(ip: string): boolean {
    return this.config.whitelistedIPs.includes(ip);
  }

  /**
   * IP 블랙리스트 확인
   */
  private isBlacklisted(ip: string): boolean {
    return this.config.blacklistedIPs.includes(ip);
  }

  /**
   * Rate limit 헤더 설정
   */
  private setRateLimitHeaders(res: Response, result: any): void {
    res.setHeader(this.config.headers.total, result.limit);
    res.setHeader(this.config.headers.remaining, result.remaining);
    res.setHeader(this.config.headers.reset, new Date(result.resetTime).toISOString());
  }

  /**
   * Rate limit 응답 전송
   */
  private sendRateLimitResponse(res: Response, data: {
    error: string;
    message: string;
    retryAfter: number | null;
  }): void {
    if (data.retryAfter !== null) {
      res.setHeader(this.config.headers.retryAfter, data.retryAfter);
    }

    res.status(429).json(data);
  }

  /**
   * 지연 처리
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 만료된 메모리 엔트리 정리
   */
  private cleanupMemoryStore(): void {
    const now = Date.now();
    let cleanupCount = 0;

    for (const [key, entry] of this.memoryStore.entries()) {
      if (entry.resetTime <= now) {
        this.memoryStore.delete(key);
        cleanupCount++;
      }
    }

    if (cleanupCount > 0) {
      this.logger.debug(`Rate limit 메모리 정리: ${cleanupCount}개 엔트리 제거`);
    }
  }

  /**
   * IP를 화이트리스트에 추가
   */
  addToWhitelist(ip: string): void {
    if (!this.config.whitelistedIPs.includes(ip)) {
      this.config.whitelistedIPs.push(ip);
      this.logger.info(`IP 화이트리스트 추가: ${ip}`);
    }
  }

  /**
   * IP를 블랙리스트에 추가
   */
  addToBlacklist(ip: string): void {
    if (!this.config.blacklistedIPs.includes(ip)) {
      this.config.blacklistedIPs.push(ip);
      this.logger.info(`IP 블랙리스트 추가: ${ip}`);
    }
  }

  /**
   * Rate limit 통계 조회
   */
  getStats() {
    return {
      ...this.stats,
      memoryStoreSize: this.memoryStore.size,
      config: {
        windowMs: this.config.windowMs,
        maxRequests: this.config.maxRequests,
        keyGenerator: this.config.keyGenerator,
        store: this.config.store
      }
    };
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.memoryStore.clear();
    this.logger.info('RateLimitMiddleware 종료');
  }
}