import { createClient, RedisClientType } from 'redis';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    [key: string]: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
  };
  dependencies: {
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
  };
}

export class HealthChecker {
  private redisClient: RedisClientType | null = null;
  private serviceEndpoints: Map<string, string> = new Map();

  constructor() {
    this.initializeServiceEndpoints();
  }

  /**
   * 서비스 엔드포인트 초기화
   */
  private initializeServiceEndpoints(): void {
    this.serviceEndpoints.set('auth-service', 'http://localhost:3001/actuator/health');
    this.serviceEndpoints.set('pmis-service', 'http://localhost:3002/actuator/health');
    this.serviceEndpoints.set('billing-service', 'http://localhost:3003/actuator/health');
    this.serviceEndpoints.set('file-dms-service', 'http://localhost:3004/actuator/health');
    this.serviceEndpoints.set('notification-service', 'http://localhost:3005/actuator/health');
  }

  /**
   * Redis 클라이언트 설정
   */
  public setRedisClient(client: RedisClientType): void {
    this.redisClient = client;
  }

  /**
   * 전체 헬스체크 수행
   */
  public async checkAll(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const services: any = {};
    const dependencies: any = {};

    // Redis 헬스체크
    dependencies.redis = await this.checkRedis();

    // 각 서비스 헬스체크
    for (const [serviceName, endpoint] of this.serviceEndpoints) {
      services[serviceName] = await this.checkService(serviceName, endpoint);
    }

    // 전체 상태 결정
    const allHealthy = Object.values(services).every((s: any) => s.status === 'healthy') &&
                      Object.values(dependencies).every((d: any) => d.status === 'healthy');

    const anyUnhealthy = Object.values(services).some((s: any) => s.status === 'unhealthy') ||
                         Object.values(dependencies).some((d: any) => d.status === 'unhealthy');

    let status: 'healthy' | 'unhealthy' | 'degraded';
    if (allHealthy) {
      status = 'healthy';
    } else if (anyUnhealthy) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return {
      status,
      timestamp,
      services,
      dependencies
    };
  }

  /**
   * Redis 헬스체크
   */
  private async checkRedis(): Promise<any> {
    const startTime = Date.now();
    
    try {
      if (!this.redisClient) {
        return {
          status: 'unhealthy',
          error: 'Redis client not initialized'
        };
      }

      await this.redisClient.ping();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 개별 서비스 헬스체크
   */
  private async checkService(serviceName: string, endpoint: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Gateway-HealthChecker/1.0'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          status: 'healthy',
          responseTime
        };
      } else {
        return {
          status: 'unhealthy',
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          status: 'unhealthy',
          responseTime,
          error: 'Request timeout'
        };
      }

      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 특정 서비스 헬스체크
   */
  public async checkService(serviceName: string): Promise<any> {
    const endpoint = this.serviceEndpoints.get(serviceName);
    if (!endpoint) {
      return {
        status: 'unhealthy',
        error: `Service ${serviceName} not found in health check configuration`
      };
    }

    return this.checkService(serviceName, endpoint);
  }

  /**
   * 서비스 엔드포인트 추가
   */
  public addServiceEndpoint(serviceName: string, endpoint: string): void {
    this.serviceEndpoints.set(serviceName, endpoint);
  }

  /**
   * 서비스 엔드포인트 제거
   */
  public removeServiceEndpoint(serviceName: string): void {
    this.serviceEndpoints.delete(serviceName);
  }
}

