export interface MetricData {
  name: string;
  value: number;
  labels?: { [key: string]: string };
  timestamp: number;
}

export interface ServiceMetrics {
  serviceName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime: number;
  uptime: number;
}

export interface GatewayMetrics {
  totalRequests: number;
  totalResponses: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  services: { [serviceName: string]: ServiceMetrics };
  timestamp: number;
}

export class MetricsCollector {
  private metrics: Map<string, MetricData[]> = new Map();
  private serviceMetrics: Map<string, ServiceMetrics> = new Map();
  private startTime: number = Date.now();
  private requestCount: number = 0;
  private responseCount: number = 0;
  private totalResponseTime: number = 0;
  private errorCount: number = 0;

  constructor() {
    this.initializeMetrics();
  }

  /**
   * 메트릭 초기화
   */
  private initializeMetrics(): void {
    // 기본 메트릭 초기화
    this.recordMetric('gateway_start_time', this.startTime);
    this.recordMetric('gateway_uptime', 0);
  }

  /**
   * 메트릭 기록
   */
  public recordMetric(name: string, value: number, labels?: { [key: string]: string }): void {
    const metric: MetricData = {
      name,
      value,
      labels,
      timestamp: Date.now()
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricsArray = this.metrics.get(name)!;
    metricsArray.push(metric);

    // 최대 1000개 메트릭만 유지
    if (metricsArray.length > 1000) {
      metricsArray.shift();
    }
  }

  /**
   * 요청 메트릭 기록
   */
  public recordRequest(serviceName: string, responseTime: number, success: boolean): void {
    this.requestCount++;
    this.totalResponseTime += responseTime;

    if (success) {
      this.responseCount++;
    } else {
      this.errorCount++;
    }

    // 서비스별 메트릭 업데이트
    this.updateServiceMetrics(serviceName, responseTime, success);

    // 전체 메트릭 기록
    this.recordMetric('gateway_requests_total', this.requestCount);
    this.recordMetric('gateway_responses_total', this.responseCount);
    this.recordMetric('gateway_errors_total', this.errorCount);
    this.recordMetric('gateway_response_time', responseTime, { service: serviceName });
  }

  /**
   * 서비스별 메트릭 업데이트
   */
  private updateServiceMetrics(serviceName: string, responseTime: number, success: boolean): void {
    let serviceMetric = this.serviceMetrics.get(serviceName);
    
    if (!serviceMetric) {
      serviceMetric = {
        serviceName,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        lastRequestTime: 0,
        uptime: 0
      };
    }

    serviceMetric.totalRequests++;
    serviceMetric.lastRequestTime = Date.now();

    if (success) {
      serviceMetric.successfulRequests++;
    } else {
      serviceMetric.failedRequests++;
    }

    // 평균 응답 시간 계산
    const totalTime = serviceMetric.averageResponseTime * (serviceMetric.totalRequests - 1) + responseTime;
    serviceMetric.averageResponseTime = totalTime / serviceMetric.totalRequests;

    this.serviceMetrics.set(serviceName, serviceMetric);
  }

  /**
   * 전체 메트릭 조회
   */
  public getMetrics(): GatewayMetrics {
    const currentTime = Date.now();
    const uptime = currentTime - this.startTime;
    const averageResponseTime = this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0;
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;

    // 서비스별 메트릭 업데이트
    for (const [serviceName, serviceMetric] of this.serviceMetrics) {
      serviceMetric.uptime = uptime;
    }

    return {
      totalRequests: this.requestCount,
      totalResponses: this.responseCount,
      averageResponseTime,
      errorRate,
      activeConnections: this.getActiveConnections(),
      services: Object.fromEntries(this.serviceMetrics),
      timestamp: currentTime
    };
  }

  /**
   * 특정 메트릭 조회
   */
  public getMetric(name: string): MetricData[] {
    return this.metrics.get(name) || [];
  }

  /**
   * 서비스별 메트릭 조회
   */
  public getServiceMetrics(serviceName: string): ServiceMetrics | undefined {
    return this.serviceMetrics.get(serviceName);
  }

  /**
   * 활성 연결 수 조회 (시뮬레이션)
   */
  private getActiveConnections(): number {
    // 실제 구현에서는 WebSocket 연결 수나 활성 요청 수를 추적
    return Math.floor(Math.random() * 100) + 10;
  }

  /**
   * 메트릭 리셋
   */
  public resetMetrics(): void {
    this.metrics.clear();
    this.serviceMetrics.clear();
    this.requestCount = 0;
    this.responseCount = 0;
    this.totalResponseTime = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
    this.initializeMetrics();
  }

  /**
   * 오래된 메트릭 정리
   */
  public cleanupOldMetrics(maxAge: number = 3600000): void { // 1시간
    const cutoffTime = Date.now() - maxAge;

    for (const [name, metrics] of this.metrics) {
      const filteredMetrics = metrics.filter(metric => metric.timestamp > cutoffTime);
      this.metrics.set(name, filteredMetrics);
    }
  }

  /**
   * 메트릭 내보내기 (Prometheus 형식)
   */
  public exportPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    let prometheusMetrics = '';

    // Gateway 메트릭
    prometheusMetrics += `# HELP gateway_requests_total Total number of requests\n`;
    prometheusMetrics += `# TYPE gateway_requests_total counter\n`;
    prometheusMetrics += `gateway_requests_total ${metrics.totalRequests}\n\n`;

    prometheusMetrics += `# HELP gateway_responses_total Total number of successful responses\n`;
    prometheusMetrics += `# TYPE gateway_responses_total counter\n`;
    prometheusMetrics += `gateway_responses_total ${metrics.totalResponses}\n\n`;

    prometheusMetrics += `# HELP gateway_average_response_time Average response time in milliseconds\n`;
    prometheusMetrics += `# TYPE gateway_average_response_time gauge\n`;
    prometheusMetrics += `gateway_average_response_time ${metrics.averageResponseTime}\n\n`;

    prometheusMetrics += `# HELP gateway_error_rate Error rate percentage\n`;
    prometheusMetrics += `# TYPE gateway_error_rate gauge\n`;
    prometheusMetrics += `gateway_error_rate ${metrics.errorRate}\n\n`;

    // 서비스별 메트릭
    for (const [serviceName, serviceMetric] of Object.entries(metrics.services)) {
      prometheusMetrics += `# HELP service_requests_total Total requests for service\n`;
      prometheusMetrics += `# TYPE service_requests_total counter\n`;
      prometheusMetrics += `service_requests_total{service="${serviceName}"} ${serviceMetric.totalRequests}\n\n`;

      prometheusMetrics += `# HELP service_response_time Average response time for service\n`;
      prometheusMetrics += `# TYPE service_response_time gauge\n`;
      prometheusMetrics += `service_response_time{service="${serviceName}"} ${serviceMetric.averageResponseTime}\n\n`;
    }

    return prometheusMetrics;
  }
}

