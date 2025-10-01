import { ServiceDefinition, ServiceEndpoint, LoadBalancingStrategy } from '../types/routing';
import { Logger } from '@shared/common-libs';
import crypto from 'crypto';

export interface LoadBalancerConfig {
  defaultStrategy: LoadBalancingStrategy;
  enableStickySession: boolean;
  sessionTimeout: number;
}

export class LoadBalancer {
  private logger: Logger;
  private config: LoadBalancerConfig;
  private roundRobinCounters: Map<string, number> = new Map();
  private stickySessions: Map<string, { endpointId: string; timestamp: number }> = new Map();
  private connectionCounts: Map<string, number> = new Map();

  constructor(logger: Logger, config: LoadBalancerConfig) {
    this.logger = logger;
    this.config = config;
    
    // 주기적으로 만료된 세션 정리
    if (config.enableStickySession) {
      setInterval(() => this.cleanupExpiredSessions(), 60000); // 1분마다
    }
  }

  /**
   * 서비스의 엔드포인트 선택
   */
  async selectEndpoint(
    service: ServiceDefinition, 
    clientIp?: string,
    sessionId?: string
  ): Promise<ServiceEndpoint | null> {
    const healthyEndpoints = service.endpoints.filter(endpoint => endpoint.healthy);
    
    if (healthyEndpoints.length === 0) {
      this.logger.warn(`건강한 엔드포인트가 없습니다: ${service.name}`);
      return null;
    }

    if (healthyEndpoints.length === 1) {
      return healthyEndpoints[0];
    }

    // Sticky Session 체크
    if (this.config.enableStickySession && sessionId) {
      const stickyEndpoint = this.getStickyEndpoint(service.name, sessionId, healthyEndpoints);
      if (stickyEndpoint) {
        return stickyEndpoint;
      }
    }

    // 로드밸런싱 전략에 따른 엔드포인트 선택
    const strategy = this.config.defaultStrategy;
    let selectedEndpoint: ServiceEndpoint | null = null;

    switch (strategy.type) {
      case 'round-robin':
        selectedEndpoint = this.selectRoundRobin(service.name, healthyEndpoints);
        break;
      
      case 'weighted-round-robin':
        selectedEndpoint = this.selectWeightedRoundRobin(service.name, healthyEndpoints);
        break;
      
      case 'least-connections':
        selectedEndpoint = this.selectLeastConnections(healthyEndpoints);
        break;
      
      case 'ip-hash':
        selectedEndpoint = this.selectIpHash(clientIp || '', healthyEndpoints);
        break;
      
      default:
        selectedEndpoint = this.selectRoundRobin(service.name, healthyEndpoints);
    }

    // Sticky Session 설정
    if (this.config.enableStickySession && sessionId && selectedEndpoint) {
      this.setStickySession(service.name, sessionId, selectedEndpoint.id);
    }

    // 연결 수 증가
    if (selectedEndpoint && strategy.type === 'least-connections') {
      this.incrementConnection(selectedEndpoint.id);
    }

    return selectedEndpoint;
  }

  /**
   * Round Robin 방식
   */
  private selectRoundRobin(serviceName: string, endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const currentIndex = this.roundRobinCounters.get(serviceName) || 0;
    const selectedIndex = currentIndex % endpoints.length;
    
    this.roundRobinCounters.set(serviceName, selectedIndex + 1);
    
    return endpoints[selectedIndex];
  }

  /**
   * Weighted Round Robin 방식
   */
  private selectWeightedRoundRobin(serviceName: string, endpoints: ServiceEndpoint[]): ServiceEndpoint {
    // 가중치가 설정되지 않은 경우 기본 Round Robin
    if (!endpoints.some(ep => ep.weight && ep.weight > 1)) {
      return this.selectRoundRobin(serviceName, endpoints);
    }

    // 가중치를 기반으로 엔드포인트 풀 생성
    const weightedEndpoints: ServiceEndpoint[] = [];
    endpoints.forEach(endpoint => {
      const weight = endpoint.weight || 1;
      for (let i = 0; i < weight; i++) {
        weightedEndpoints.push(endpoint);
      }
    });

    return this.selectRoundRobin(`${serviceName}-weighted`, weightedEndpoints);
  }

  /**
   * Least Connections 방식
   */
  private selectLeastConnections(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    let selectedEndpoint = endpoints[0];
    let minConnections = this.connectionCounts.get(selectedEndpoint.id) || 0;

    for (let i = 1; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      const connections = this.connectionCounts.get(endpoint.id) || 0;
      
      if (connections < minConnections) {
        minConnections = connections;
        selectedEndpoint = endpoint;
      }
    }

    return selectedEndpoint;
  }

  /**
   * IP Hash 방식
   */
  private selectIpHash(clientIp: string, endpoints: ServiceEndpoint[]): ServiceEndpoint {
    if (!clientIp) {
      return endpoints[0];
    }

    const hash = crypto.createHash('md5').update(clientIp).digest('hex');
    const hashNumber = parseInt(hash.substring(0, 8), 16);
    const selectedIndex = hashNumber % endpoints.length;

    return endpoints[selectedIndex];
  }

  /**
   * Sticky Session 엔드포인트 조회
   */
  private getStickyEndpoint(
    serviceName: string, 
    sessionId: string, 
    healthyEndpoints: ServiceEndpoint[]
  ): ServiceEndpoint | null {
    const sessionKey = `${serviceName}:${sessionId}`;
    const session = this.stickySessions.get(sessionKey);

    if (!session) {
      return null;
    }

    // 세션 만료 체크
    if (Date.now() - session.timestamp > this.config.sessionTimeout) {
      this.stickySessions.delete(sessionKey);
      return null;
    }

    // 해당 엔드포인트가 여전히 건강한지 체크
    const endpoint = healthyEndpoints.find(ep => ep.id === session.endpointId);
    if (endpoint) {
      // 세션 갱신
      session.timestamp = Date.now();
      return endpoint;
    }

    // 엔드포인트가 건강하지 않으면 세션 삭제
    this.stickySessions.delete(sessionKey);
    return null;
  }

  /**
   * Sticky Session 설정
   */
  private setStickySession(serviceName: string, sessionId: string, endpointId: string): void {
    const sessionKey = `${serviceName}:${sessionId}`;
    this.stickySessions.set(sessionKey, {
      endpointId,
      timestamp: Date.now()
    });
  }

  /**
   * 연결 수 증가
   */
  incrementConnection(endpointId: string): void {
    const current = this.connectionCounts.get(endpointId) || 0;
    this.connectionCounts.set(endpointId, current + 1);
  }

  /**
   * 연결 수 감소
   */
  decrementConnection(endpointId: string): void {
    const current = this.connectionCounts.get(endpointId) || 0;
    if (current > 0) {
      this.connectionCounts.set(endpointId, current - 1);
    }
  }

  /**
   * 엔드포인트 응답 시간 기록
   */
  recordResponseTime(endpointId: string, responseTime: number): void {
    // 향후 응답 시간 기반 로드밸런싱을 위한 기록
    this.logger.debug(`응답 시간 기록: ${endpointId} = ${responseTime}ms`);
  }

  /**
   * 만료된 Sticky Session 정리
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionKey, session] of this.stickySessions.entries()) {
      if (now - session.timestamp > this.config.sessionTimeout) {
        expiredSessions.push(sessionKey);
      }
    }

    expiredSessions.forEach(sessionKey => {
      this.stickySessions.delete(sessionKey);
    });

    if (expiredSessions.length > 0) {
      this.logger.debug(`만료된 Sticky Session ${expiredSessions.length}개 정리`);
    }
  }

  /**
   * Round Robin 카운터 초기화
   */
  resetRoundRobinCounter(serviceName: string): void {
    this.roundRobinCounters.set(serviceName, 0);
  }

  /**
   * 엔드포인트별 연결 수 조회
   */
  getConnectionCounts(): Map<string, number> {
    return new Map(this.connectionCounts);
  }

  /**
   * Sticky Session 수 조회
   */
  getStickySessionCount(): number {
    return this.stickySessions.size;
  }

  /**
   * 로드밸런서 통계 조회
   */
  getLoadBalancerStats(): {
    totalSessions: number;
    totalConnections: number;
    roundRobinServices: number;
    connectionsByEndpoint: Record<string, number>;
  } {
    const totalSessions = this.stickySessions.size;
    const roundRobinServices = this.roundRobinCounters.size;
    
    let totalConnections = 0;
    const connectionsByEndpoint: Record<string, number> = {};
    
    for (const [endpointId, count] of this.connectionCounts.entries()) {
      totalConnections += count;
      connectionsByEndpoint[endpointId] = count;
    }

    return {
      totalSessions,
      totalConnections,
      roundRobinServices,
      connectionsByEndpoint
    };
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.roundRobinCounters.clear();
    this.stickySessions.clear();
    this.connectionCounts.clear();
    this.logger.info('LoadBalancer 종료');
  }
}