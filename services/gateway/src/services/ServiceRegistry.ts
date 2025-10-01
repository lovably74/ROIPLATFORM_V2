import { ServiceDefinition, ServiceEndpoint, HealthStatus } from '../types/routing';
import { Logger } from '@shared/common-libs';
import { EventEmitter } from 'events';

export interface ServiceRegistryConfig {
  healthCheckInterval: number;
  defaultTimeout: number;
  defaultRetries: number;
}

export class ServiceRegistry extends EventEmitter {
  private services: Map<string, ServiceDefinition> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private logger: Logger;
  private config: ServiceRegistryConfig;

  constructor(config: ServiceRegistryConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
  }

  /**
   * 서비스 등록
   */
  registerService(service: ServiceDefinition): void {
    const existingService = this.services.get(service.name);
    
    if (existingService) {
      this.logger.info(`서비스 업데이트: ${service.name}`, { 
        version: service.version,
        endpoints: service.endpoints.length 
      });
    } else {
      this.logger.info(`새 서비스 등록: ${service.name}`, { 
        version: service.version,
        endpoints: service.endpoints.length 
      });
    }

    // 기본값 설정
    const serviceWithDefaults: ServiceDefinition = {
      ...service,
      healthCheckInterval: service.healthCheckInterval || this.config.healthCheckInterval,
      timeout: service.timeout || this.config.defaultTimeout,
      retries: service.retries || this.config.defaultRetries,
      healthCheckPath: service.healthCheckPath || '/health'
    };

    this.services.set(service.name, serviceWithDefaults);
    this.emit('serviceRegistered', serviceWithDefaults);
  }

  /**
   * 서비스 등록 해제
   */
  unregisterService(serviceName: string): boolean {
    const service = this.services.get(serviceName);
    if (service) {
      this.services.delete(serviceName);
      this.logger.info(`서비스 등록 해제: ${serviceName}`);
      this.emit('serviceUnregistered', service);
      return true;
    }
    return false;
  }

  /**
   * 서비스 조회
   */
  getService(serviceName: string): ServiceDefinition | undefined {
    return this.services.get(serviceName);
  }

  /**
   * 모든 서비스 조회
   */
  getAllServices(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }

  /**
   * 건강한 엔드포인트만 조회
   */
  getHealthyEndpoints(serviceName: string): ServiceEndpoint[] {
    const service = this.services.get(serviceName);
    if (!service) {
      return [];
    }
    return service.endpoints.filter(endpoint => endpoint.healthy);
  }

  /**
   * 엔드포인트 상태 업데이트
   */
  updateEndpointHealth(
    serviceName: string, 
    endpointId: string, 
    healthy: boolean, 
    responseTime?: number,
    error?: string
  ): void {
    const service = this.services.get(serviceName);
    if (!service) {
      return;
    }

    const endpoint = service.endpoints.find(ep => ep.id === endpointId);
    if (!endpoint) {
      return;
    }

    const wasHealthy = endpoint.healthy;
    endpoint.healthy = healthy;
    endpoint.lastHealthCheck = new Date();
    
    if (responseTime !== undefined) {
      endpoint.responseTime = responseTime;
    }

    // 상태 변화 시 이벤트 발생
    if (wasHealthy !== healthy) {
      const status = healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY;
      this.logger.info(`엔드포인트 상태 변화: ${serviceName}/${endpointId} -> ${status}`, {
        responseTime,
        error
      });
      
      this.emit('endpointHealthChanged', {
        serviceName,
        endpointId,
        healthy,
        responseTime,
        error
      });
    }
  }

  /**
   * 서비스에 엔드포인트 추가
   */
  addEndpoint(serviceName: string, endpoint: ServiceEndpoint): boolean {
    const service = this.services.get(serviceName);
    if (!service) {
      return false;
    }

    // 중복 체크
    const exists = service.endpoints.some(ep => ep.id === endpoint.id);
    if (exists) {
      return false;
    }

    service.endpoints.push(endpoint);
    this.logger.info(`엔드포인트 추가: ${serviceName}/${endpoint.id}`, { url: endpoint.url });
    this.emit('endpointAdded', { serviceName, endpoint });
    return true;
  }

  /**
   * 서비스에서 엔드포인트 제거
   */
  removeEndpoint(serviceName: string, endpointId: string): boolean {
    const service = this.services.get(serviceName);
    if (!service) {
      return false;
    }

    const index = service.endpoints.findIndex(ep => ep.id === endpointId);
    if (index === -1) {
      return false;
    }

    const removedEndpoint = service.endpoints.splice(index, 1)[0];
    this.logger.info(`엔드포인트 제거: ${serviceName}/${endpointId}`);
    this.emit('endpointRemoved', { serviceName, endpoint: removedEndpoint });
    return true;
  }

  /**
   * 서비스 통계 조회
   */
  getServiceStats(serviceName: string): {
    totalEndpoints: number;
    healthyEndpoints: number;
    unhealthyEndpoints: number;
    averageResponseTime: number;
  } | null {
    const service = this.services.get(serviceName);
    if (!service) {
      return null;
    }

    const totalEndpoints = service.endpoints.length;
    const healthyEndpoints = service.endpoints.filter(ep => ep.healthy).length;
    const unhealthyEndpoints = totalEndpoints - healthyEndpoints;
    
    const responseTimes = service.endpoints
      .filter(ep => ep.responseTime !== undefined)
      .map(ep => ep.responseTime!);
    
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;

    return {
      totalEndpoints,
      healthyEndpoints,
      unhealthyEndpoints,
      averageResponseTime
    };
  }

  /**
   * 헬스체크 시작
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.logger.info('헬스체크 시작');
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckInterval
    );
  }

  /**
   * 헬스체크 중지
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('헬스체크 중지');
    }
  }

  /**
   * 모든 서비스의 헬스체크 수행
   */
  private async performHealthChecks(): Promise<void> {
    const services = Array.from(this.services.values());
    
    for (const service of services) {
      for (const endpoint of service.endpoints) {
        try {
          await this.checkEndpointHealth(service, endpoint);
        } catch (error) {
          this.logger.error(`헬스체크 실행 중 오류: ${service.name}/${endpoint.id}`, error);
        }
      }
    }
  }

  /**
   * 개별 엔드포인트 헬스체크
   */
  private async checkEndpointHealth(
    service: ServiceDefinition, 
    endpoint: ServiceEndpoint
  ): Promise<void> {
    const startTime = Date.now();
    const healthUrl = `${endpoint.url}${service.healthCheckPath}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), service.timeout);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'ROI-Gateway-HealthCheck/1.0'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      const healthy = response.ok;
      this.updateEndpointHealth(service.name, endpoint.id, healthy, responseTime);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.updateEndpointHealth(
        service.name, 
        endpoint.id, 
        false, 
        responseTime,
        errorMessage
      );
    }
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.stopHealthChecks();
    this.services.clear();
    this.removeAllListeners();
    this.logger.info('ServiceRegistry 종료');
  }
}