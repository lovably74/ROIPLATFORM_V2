import { Request } from 'express';
import { RoutingRule, ServiceDefinition, RouteMatch, ServiceEndpoint } from '../types/routing';
import { ServiceRegistry } from './ServiceRegistry';
import { Logger } from '@shared/common-libs';
import { LoadBalancer } from './LoadBalancer';

export interface RouterServiceConfig {
  enablePathRewriting: boolean;
  enableQueryParamMatching: boolean;
  enableHeaderMatching: boolean;
  defaultPriority: number;
}

export class RouterService {
  private routingRules: Map<string, RoutingRule> = new Map();
  private serviceRegistry: ServiceRegistry;
  private loadBalancer: LoadBalancer;
  private logger: Logger;
  private config: RouterServiceConfig;

  constructor(
    serviceRegistry: ServiceRegistry,
    loadBalancer: LoadBalancer,
    logger: Logger,
    config: RouterServiceConfig
  ) {
    this.serviceRegistry = serviceRegistry;
    this.loadBalancer = loadBalancer;
    this.logger = logger;
    this.config = config;
  }

  /**
   * 라우팅 규칙 추가
   */
  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.set(rule.id, rule);
    this.logger.info(`라우팅 규칙 추가: ${rule.id}`, {
      pattern: rule.pattern,
      serviceName: rule.serviceName,
      priority: rule.priority
    });
  }

  /**
   * 라우팅 규칙 제거
   */
  removeRoutingRule(ruleId: string): boolean {
    const removed = this.routingRules.delete(ruleId);
    if (removed) {
      this.logger.info(`라우팅 규칙 제거: ${ruleId}`);
    }
    return removed;
  }

  /**
   * 라우팅 규칙 업데이트
   */
  updateRoutingRule(rule: RoutingRule): boolean {
    if (!this.routingRules.has(rule.id)) {
      return false;
    }
    
    rule.updatedAt = new Date();
    this.routingRules.set(rule.id, rule);
    this.logger.info(`라우팅 규칙 업데이트: ${rule.id}`, {
      pattern: rule.pattern,
      serviceName: rule.serviceName
    });
    return true;
  }

  /**
   * 라우팅 규칙 활성화/비활성화
   */
  toggleRoutingRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.routingRules.get(ruleId);
    if (!rule) {
      return false;
    }

    rule.enabled = enabled;
    rule.updatedAt = new Date();
    this.logger.info(`라우팅 규칙 ${enabled ? '활성화' : '비활성화'}: ${ruleId}`);
    return true;
  }

  /**
   * 요청에 대한 라우팅 매치 찾기
   */
  async findRoute(req: Request): Promise<RouteMatch | null> {
    const activatedRules = Array.from(this.routingRules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority); // 높은 우선순위부터

    for (const rule of activatedRules) {
      if (await this.matchRule(rule, req)) {
        const service = this.serviceRegistry.getService(rule.serviceName);
        if (!service) {
          this.logger.warn(`라우팅 규칙 매치되었으나 서비스 없음: ${rule.serviceName}`, {
            ruleId: rule.id,
            pattern: rule.pattern
          });
          continue;
        }

        const endpoint = await this.loadBalancer.selectEndpoint(service);
        if (!endpoint) {
          this.logger.warn(`사용 가능한 엔드포인트 없음: ${rule.serviceName}`, {
            ruleId: rule.id
          });
          continue;
        }

        const pathParams = this.extractPathParams(rule.pattern, req.path);
        const rewrittenPath = this.rewritePath(rule, req.path, pathParams);

        return {
          rule,
          service,
          endpoint,
          pathParams,
          rewrittenPath
        };
      }
    }

    return null;
  }

  /**
   * 규칙과 요청 매칭 검사
   */
  private async matchRule(rule: RoutingRule, req: Request): Promise<boolean> {
    // URL 패턴 매칭
    if (!this.matchUrlPattern(rule.pattern, req.path)) {
      return false;
    }

    // HTTP 메서드 매칭
    if (rule.method && rule.method.length > 0) {
      if (!rule.method.includes(req.method)) {
        return false;
      }
    }

    // 프로젝트 코드 매칭
    if (rule.projectCode) {
      const requestProjectCode = req.headers['x-project-code'] as string;
      if (rule.projectCode !== requestProjectCode) {
        return false;
      }
    }

    // 테넌트 ID 매칭
    if (rule.tenantId) {
      const requestTenantId = req.headers['x-tenant-id'] as string;
      if (rule.tenantId !== requestTenantId) {
        return false;
      }
    }

    // 헤더 매칭
    if (this.config.enableHeaderMatching && rule.headers) {
      if (!this.matchHeaders(rule.headers, req.headers)) {
        return false;
      }
    }

    // 쿼리 파라미터 매칭
    if (this.config.enableQueryParamMatching && rule.queryParams) {
      if (!this.matchQueryParams(rule.queryParams, req.query)) {
        return false;
      }
    }

    return true;
  }

  /**
   * URL 패턴 매칭
   */
  private matchUrlPattern(pattern: string, path: string): boolean {
    // 와일드카드 패턴을 정규식으로 변환
    const regexPattern = pattern
      .replace(/\*/g, '([^/]*)')  // * -> 경로 세그먼트 내 매칭
      .replace(/\*\*/g, '(.*)')   // ** -> 전체 경로 매칭
      .replace(/:\w+/g, '([^/]+)'); // :param -> 파라미터 매칭

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * 헤더 매칭
   */
  private matchHeaders(ruleHeaders: Record<string, string>, requestHeaders: Record<string, any>): boolean {
    for (const [key, expectedValue] of Object.entries(ruleHeaders)) {
      const headerValue = requestHeaders[key.toLowerCase()];
      if (!headerValue || headerValue !== expectedValue) {
        return false;
      }
    }
    return true;
  }

  /**
   * 쿼리 파라미터 매칭
   */
  private matchQueryParams(ruleParams: Record<string, string>, requestQuery: any): boolean {
    for (const [key, expectedValue] of Object.entries(ruleParams)) {
      const queryValue = requestQuery[key];
      if (!queryValue || queryValue !== expectedValue) {
        return false;
      }
    }
    return true;
  }

  /**
   * 경로 파라미터 추출
   */
  private extractPathParams(pattern: string, path: string): Record<string, string> {
    const params: Record<string, string> = {};
    
    // :param 형태의 파라미터 추출
    const paramNames: string[] = [];
    const regexPattern = pattern.replace(/:(\w+)/g, (match, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    const regex = new RegExp(`^${regexPattern}$`);
    const matches = path.match(regex);

    if (matches && paramNames.length > 0) {
      paramNames.forEach((paramName, index) => {
        params[paramName] = matches[index + 1];
      });
    }

    return params;
  }

  /**
   * 경로 재작성
   */
  private rewritePath(rule: RoutingRule, originalPath: string, pathParams: Record<string, string>): string {
    if (!this.config.enablePathRewriting || !rule.rewritePath) {
      return originalPath;
    }

    let rewrittenPath = rule.rewritePath;

    // 파라미터 치환
    for (const [paramName, paramValue] of Object.entries(pathParams)) {
      rewrittenPath = rewrittenPath.replace(`:${paramName}`, paramValue);
    }

    // 와일드카드 처리 (간단한 구현)
    if (rule.pattern.includes('*')) {
      const wildcardValue = this.extractWildcardValue(rule.pattern, originalPath);
      rewrittenPath = rewrittenPath.replace('*', wildcardValue);
    }

    return rewrittenPath;
  }

  /**
   * 와일드카드 값 추출
   */
  private extractWildcardValue(pattern: string, path: string): string {
    const wildcardIndex = pattern.indexOf('*');
    if (wildcardIndex === -1) {
      return '';
    }

    const prefix = pattern.substring(0, wildcardIndex);
    const suffix = pattern.substring(wildcardIndex + 1);
    
    let value = path;
    if (prefix) {
      value = value.substring(prefix.length);
    }
    if (suffix) {
      value = value.substring(0, value.length - suffix.length);
    }

    return value;
  }

  /**
   * 모든 라우팅 규칙 조회
   */
  getAllRoutingRules(): RoutingRule[] {
    return Array.from(this.routingRules.values());
  }

  /**
   * 활성화된 라우팅 규칙 조회
   */
  getActiveRoutingRules(): RoutingRule[] {
    return Array.from(this.routingRules.values()).filter(rule => rule.enabled);
  }

  /**
   * 서비스별 라우팅 규칙 조회
   */
  getRoutingRulesByService(serviceName: string): RoutingRule[] {
    return Array.from(this.routingRules.values())
      .filter(rule => rule.serviceName === serviceName);
  }

  /**
   * 기본 라우팅 규칙 생성 (서비스 등록 시 자동 생성)
   */
  createDefaultRoutingRule(serviceName: string): RoutingRule {
    const rule: RoutingRule = {
      id: `default-${serviceName}-${Date.now()}`,
      priority: this.config.defaultPriority,
      pattern: `/api/${serviceName}/*`,
      serviceName,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.addRoutingRule(rule);
    return rule;
  }

  /**
   * 라우팅 통계 조회
   */
  getRoutingStats(): {
    totalRules: number;
    activeRules: number;
    inactiveRules: number;
    rulesByService: Record<string, number>;
  } {
    const rules = Array.from(this.routingRules.values());
    const totalRules = rules.length;
    const activeRules = rules.filter(rule => rule.enabled).length;
    const inactiveRules = totalRules - activeRules;

    const rulesByService: Record<string, number> = {};
    rules.forEach(rule => {
      rulesByService[rule.serviceName] = (rulesByService[rule.serviceName] || 0) + 1;
    });

    return {
      totalRules,
      activeRules,
      inactiveRules,
      rulesByService
    };
  }
}