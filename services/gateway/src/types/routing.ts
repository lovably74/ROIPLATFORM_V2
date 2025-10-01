export interface ServiceEndpoint {
  id: string;
  url: string;
  weight?: number;
  healthy: boolean;
  lastHealthCheck?: Date;
  responseTime?: number;
}

export interface ServiceDefinition {
  name: string;
  version: string;
  endpoints: ServiceEndpoint[];
  healthCheckPath?: string;
  healthCheckInterval?: number;
  timeout?: number;
  retries?: number;
}

export interface RoutingRule {
  id: string;
  priority: number;
  pattern: string; // URL 패턴 (예: /api/user/*, /api/order/*)
  method?: string[]; // HTTP 메서드 (GET, POST 등)
  serviceName: string;
  projectCode?: string; // 프로젝트별 라우팅
  tenantId?: string; // 테넌트별 라우팅
  headers?: Record<string, string>; // 헤더 기반 라우팅
  queryParams?: Record<string, string>; // 쿼리 파라미터 기반 라우팅
  rewritePath?: string; // 경로 재작성 규칙
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoadBalancingStrategy {
  type: 'round-robin' | 'weighted-round-robin' | 'least-connections' | 'ip-hash';
  options?: Record<string, any>;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedFailureRate: number;
}

export interface ProxyConfig {
  timeout: number;
  retries: number;
  retryDelay: number;
  keepAlive: boolean;
  followRedirects: boolean;
  circuitBreaker?: CircuitBreakerConfig;
  loadBalancing: LoadBalancingStrategy;
}

export interface RouteMatch {
  rule: RoutingRule;
  service: ServiceDefinition;
  endpoint: ServiceEndpoint;
  pathParams: Record<string, string>;
  rewrittenPath?: string;
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

export interface HealthCheckResult {
  serviceId: string;
  endpointId: string;
  status: HealthStatus;
  responseTime: number;
  error?: string;
  timestamp: Date;
}