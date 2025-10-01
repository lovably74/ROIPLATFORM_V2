import { Request, Response } from 'express';
import { RouteMatch, ProxyConfig, CircuitBreakerConfig } from '../types/routing';
import { Logger } from '@shared/common-libs';
import { LoadBalancer } from './LoadBalancer';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export class ProxyService {
  private logger: Logger;
  private loadBalancer: LoadBalancer;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private defaultConfig: ProxyConfig;

  constructor(logger: Logger, loadBalancer: LoadBalancer, defaultConfig: ProxyConfig) {
    this.logger = logger;
    this.loadBalancer = loadBalancer;
    this.defaultConfig = defaultConfig;
  }

  /**
   * 프록시 요청 처리
   */
  async proxyRequest(req: Request, res: Response, routeMatch: RouteMatch): Promise<void> {
    const startTime = Date.now();
    const { rule, service, endpoint } = routeMatch;
    
    try {
      // Circuit Breaker 체크
      if (!this.canProceedWithRequest(endpoint.id, service.name)) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Circuit breaker is open',
          serviceName: service.name,
          endpointId: endpoint.id
        });
        return;
      }

      // 프록시 URL 구성
      const targetPath = routeMatch.rewrittenPath || req.path;
      const targetUrl = this.buildTargetUrl(endpoint.url, targetPath, req.query);

      // 요청 헤더 준비
      const proxyHeaders = this.prepareProxyHeaders(req);
      
      this.logger.info(`프록시 요청: ${req.method} ${req.path} -> ${targetUrl}`, {
        serviceName: service.name,
        endpointId: endpoint.id,
        ruleId: rule.id
      });

      // HTTP/HTTPS 요청 수행
      const response = await this.performProxyRequest(
        req,
        targetUrl,
        proxyHeaders,
        service.timeout || this.defaultConfig.timeout
      );

      // Circuit Breaker 성공 기록
      this.recordSuccess(endpoint.id);
      
      // 응답 시간 기록
      const responseTime = Date.now() - startTime;
      this.loadBalancer.recordResponseTime(endpoint.id, responseTime);

      // 응답 헤더 설정
      this.setResponseHeaders(res, response.headers, endpoint);
      
      // 응답 상태 및 데이터 전달
      res.status(response.statusCode);
      
      if (response.body) {
        if (response.headers['content-type']?.includes('application/json')) {
          res.json(response.body);
        } else {
          res.send(response.body);
        }
      } else {
        res.end();
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.handleProxyError(error, req, res, routeMatch, responseTime);
    }
  }

  /**
   * HTTP/HTTPS 프록시 요청 수행
   */
  private async performProxyRequest(
    req: Request,
    targetUrl: string,
    headers: Record<string, string>,
    timeout: number
  ): Promise<{ statusCode: number; headers: any; body: any }> {
    return new Promise((resolve, reject) => {
      const url = new URL(targetUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: req.method,
        headers,
        timeout
      };

      const proxyReq = client.request(options, (proxyRes) => {
        let body = '';
        
        proxyRes.on('data', (chunk) => {
          body += chunk;
        });

        proxyRes.on('end', () => {
          let parsedBody = body;
          
          // JSON 응답 파싱 시도
          if (proxyRes.headers['content-type']?.includes('application/json')) {
            try {
              parsedBody = JSON.parse(body);
            } catch (e) {
              // 파싱 실패 시 원본 문자열 사용
            }
          }

          resolve({
            statusCode: proxyRes.statusCode || 200,
            headers: proxyRes.headers,
            body: parsedBody
          });
        });
      });

      proxyReq.on('error', (error) => {
        reject(error);
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reject(new Error('Request timeout'));
      });

      // POST/PUT 등의 요청 바디 전달
      if (req.body) {
        const bodyData = typeof req.body === 'string' 
          ? req.body 
          : JSON.stringify(req.body);
        proxyReq.write(bodyData);
      }

      proxyReq.end();
    });
  }

  /**
   * 타겟 URL 구성
   */
  private buildTargetUrl(baseUrl: string, path: string, query: any): string {
    // 기본 URL에서 마지막 슬래시 제거
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    
    // 경로에서 시작 슬래시 보장
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    let targetUrl = `${cleanBaseUrl}${cleanPath}`;

    // 쿼리 파라미터 추가
    if (query && Object.keys(query).length > 0) {
      const queryString = new URLSearchParams(query).toString();
      targetUrl += `?${queryString}`;
    }

    return targetUrl;
  }

  /**
   * 프록시 요청 헤더 준비
   */
  private prepareProxyHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};

    // 기존 헤더 복사 (특정 헤더 제외)
    const excludeHeaders = ['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'];
    
    for (const [key, value] of Object.entries(req.headers)) {
      if (!excludeHeaders.includes(key.toLowerCase()) && value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // 프록시 관련 헤더 추가
    headers['X-Forwarded-For'] = req.headers['x-forwarded-for'] 
      ? `${req.headers['x-forwarded-for']}, ${req.ip}`
      : req.ip;
    
    headers['X-Forwarded-Host'] = req.headers.host || '';
    headers['X-Forwarded-Proto'] = req.protocol;
    headers['X-Real-IP'] = req.ip;

    // User-Agent가 없으면 Gateway 정보 추가
    if (!headers['User-Agent']) {
      headers['User-Agent'] = 'ROI-Gateway/1.0';
    }

    return headers;
  }

  /**
   * 응답 헤더 설정
   */
  private setResponseHeaders(res: Response, proxyHeaders: any, endpoint: any): void {
    // 특정 헤더 제외하고 복사
    const excludeHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'];

    for (const [key, value] of Object.entries(proxyHeaders)) {
      if (!excludeHeaders.includes(key.toLowerCase()) && value) {
        res.setHeader(key, value);
      }
    }

    // Gateway 관련 헤더 추가
    res.setHeader('X-Proxied-By', 'ROI-Gateway');
    res.setHeader('X-Endpoint-Id', endpoint.id);
  }

  /**
   * Circuit Breaker 요청 허용 여부 체크
   */
  private canProceedWithRequest(endpointId: string, serviceName: string): boolean {
    const circuitBreaker = this.getCircuitBreaker(endpointId, serviceName);
    const now = Date.now();

    switch (circuitBreaker.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (now >= circuitBreaker.nextAttemptTime) {
          // HALF_OPEN으로 전환
          circuitBreaker.state = 'HALF_OPEN';
          this.logger.info(`Circuit Breaker HALF_OPEN: ${serviceName}/${endpointId}`);
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return true;
    }
  }

  /**
   * Circuit Breaker 성공 기록
   */
  private recordSuccess(endpointId: string): void {
    const circuitBreaker = this.circuitBreakers.get(endpointId);
    if (circuitBreaker) {
      if (circuitBreaker.state === 'HALF_OPEN') {
        // HALF_OPEN에서 성공하면 CLOSED로 전환
        circuitBreaker.state = 'CLOSED';
        circuitBreaker.failureCount = 0;
        this.logger.info(`Circuit Breaker CLOSED: ${endpointId}`);
      } else if (circuitBreaker.state === 'CLOSED') {
        // 실패 카운트 리셋
        circuitBreaker.failureCount = 0;
      }
    }
  }

  /**
   * Circuit Breaker 실패 기록
   */
  private recordFailure(endpointId: string, serviceName: string): void {
    const circuitBreaker = this.getCircuitBreaker(endpointId, serviceName);
    const now = Date.now();

    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = now;

    const config = this.defaultConfig.circuitBreaker!;

    if (circuitBreaker.failureCount >= config.failureThreshold) {
      if (circuitBreaker.state !== 'OPEN') {
        circuitBreaker.state = 'OPEN';
        circuitBreaker.nextAttemptTime = now + config.recoveryTimeout;
        this.logger.warn(`Circuit Breaker OPEN: ${serviceName}/${endpointId}`, {
          failureCount: circuitBreaker.failureCount,
          threshold: config.failureThreshold
        });
      }
    } else if (circuitBreaker.state === 'HALF_OPEN') {
      // HALF_OPEN에서 실패하면 다시 OPEN
      circuitBreaker.state = 'OPEN';
      circuitBreaker.nextAttemptTime = now + config.recoveryTimeout;
      this.logger.warn(`Circuit Breaker OPEN (from HALF_OPEN): ${serviceName}/${endpointId}`);
    }
  }

  /**
   * Circuit Breaker 인스턴스 조회/생성
   */
  private getCircuitBreaker(endpointId: string, serviceName: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(endpointId)) {
      this.circuitBreakers.set(endpointId, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0
      });
    }
    return this.circuitBreakers.get(endpointId)!;
  }

  /**
   * 프록시 오류 처리
   */
  private handleProxyError(
    error: any,
    req: Request,
    res: Response,
    routeMatch: RouteMatch,
    responseTime: number
  ): void {
    const { service, endpoint } = routeMatch;
    
    // Circuit Breaker 실패 기록
    this.recordFailure(endpoint.id, service.name);

    this.logger.error(`프록시 요청 실패: ${service.name}/${endpoint.id}`, {
      error: error.message,
      url: req.path,
      method: req.method,
      responseTime
    });

    // 재시도 로직 (간단한 구현)
    const retries = service.retries || this.defaultConfig.retries;
    const currentRetry = parseInt(req.headers['x-retry-count'] as string || '0');
    
    if (currentRetry < retries && this.isRetryableError(error)) {
      // 재시도 헤더 추가하여 다시 시도
      req.headers['x-retry-count'] = (currentRetry + 1).toString();
      
      setTimeout(() => {
        this.proxyRequest(req, res, routeMatch);
      }, this.defaultConfig.retryDelay);
      
      return;
    }

    // 최종 오류 응답
    if (!res.headersSent) {
      const statusCode = this.getErrorStatusCode(error);
      res.status(statusCode).json({
        error: 'Proxy Error',
        message: error.message,
        serviceName: service.name,
        endpointId: endpoint.id,
        retryCount: currentRetry
      });
    }
  }

  /**
   * 재시도 가능한 오류인지 판단
   */
  private isRetryableError(error: any): boolean {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    if (error.message?.includes('timeout')) {
      return true;
    }
    return false;
  }

  /**
   * 오류에 따른 HTTP 상태 코드 결정
   */
  private getErrorStatusCode(error: any): number {
    if (error.code === 'ECONNREFUSED') {
      return 503; // Service Unavailable
    }
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return 504; // Gateway Timeout
    }
    return 502; // Bad Gateway
  }

  /**
   * Circuit Breaker 상태 조회
   */
  getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
    const status: Record<string, CircuitBreakerState> = {};
    for (const [endpointId, state] of this.circuitBreakers.entries()) {
      status[endpointId] = { ...state };
    }
    return status;
  }

  /**
   * Circuit Breaker 리셋
   */
  resetCircuitBreaker(endpointId: string): boolean {
    if (this.circuitBreakers.has(endpointId)) {
      this.circuitBreakers.set(endpointId, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0
      });
      this.logger.info(`Circuit Breaker 리셋: ${endpointId}`);
      return true;
    }
    return false;
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.circuitBreakers.clear();
    this.logger.info('ProxyService 종료');
  }
}