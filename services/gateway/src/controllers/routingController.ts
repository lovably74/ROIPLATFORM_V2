import { Request, Response } from 'express';
import { ServiceRegistry } from '../services/ServiceRegistry';
import { RouterService } from '../services/RouterService';
import { LoadBalancer } from '../services/LoadBalancer';
import { ProxyService } from '../services/ProxyService';
import { Logger } from '@shared/common-libs';

export class RoutingController {
  constructor(
    private serviceRegistry: ServiceRegistry,
    private routerService: RouterService,
    private loadBalancer: LoadBalancer,
    private proxyService: ProxyService,
    private logger: Logger
  ) {}

  /**
   * 서비스 등록
   */
  registerService = async (req: Request, res: Response) => {
    try {
      const serviceDefinition = req.body;
      
      // 기본 검증
      if (!serviceDefinition.name || !serviceDefinition.endpoints || serviceDefinition.endpoints.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Service name and at least one endpoint are required'
        });
      }

      // 서비스 등록
      this.serviceRegistry.registerService(serviceDefinition);
      
      // 기본 라우팅 규칙 생성
      const defaultRule = this.routerService.createDefaultRoutingRule(serviceDefinition.name);

      res.status(201).json({
        message: 'Service registered successfully',
        serviceName: serviceDefinition.name,
        defaultRoutingRule: defaultRule
      });

    } catch (error) {
      this.logger.error('서비스 등록 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register service'
      });
    }
  };

  /**
   * 서비스 목록 조회
   */
  getServices = async (req: Request, res: Response) => {
    try {
      const services = this.serviceRegistry.getAllServices();
      res.json({
        services,
        count: services.length
      });
    } catch (error) {
      this.logger.error('서비스 목록 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get services'
      });
    }
  };

  /**
   * 특정 서비스 조회
   */
  getService = async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const service = this.serviceRegistry.getService(serviceName);
      
      if (!service) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Service ${serviceName} not found`
        });
      }

      const stats = this.serviceRegistry.getServiceStats(serviceName);
      res.json({
        service,
        stats
      });

    } catch (error) {
      this.logger.error('서비스 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get service'
      });
    }
  };

  /**
   * 서비스 등록 해제
   */
  unregisterService = async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const success = this.serviceRegistry.unregisterService(serviceName);
      
      if (!success) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Service ${serviceName} not found`
        });
      }

      res.json({
        message: 'Service unregistered successfully',
        serviceName
      });

    } catch (error) {
      this.logger.error('서비스 등록 해제 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to unregister service'
      });
    }
  };

  /**
   * 라우팅 규칙 추가
   */
  addRoutingRule = async (req: Request, res: Response) => {
    try {
      const routingRule = req.body;
      
      // 기본 검증
      if (!routingRule.pattern || !routingRule.serviceName) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Pattern and service name are required'
        });
      }

      // ID가 없으면 생성
      if (!routingRule.id) {
        routingRule.id = `rule-${Date.now()}-${Math.random().toString(36).substring(2)}`;
      }

      // 날짜 설정
      const now = new Date();
      routingRule.createdAt = now;
      routingRule.updatedAt = now;
      
      // 우선순위 기본값
      if (routingRule.priority === undefined) {
        routingRule.priority = 100;
      }

      // 활성화 기본값
      if (routingRule.enabled === undefined) {
        routingRule.enabled = true;
      }

      this.routerService.addRoutingRule(routingRule);

      res.status(201).json({
        message: 'Routing rule added successfully',
        rule: routingRule
      });

    } catch (error) {
      this.logger.error('라우팅 규칙 추가 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to add routing rule'
      });
    }
  };

  /**
   * 라우팅 규칙 목록 조회
   */
  getRoutingRules = async (req: Request, res: Response) => {
    try {
      const { serviceName, enabled } = req.query;
      let rules;

      if (serviceName) {
        rules = this.routerService.getRoutingRulesByService(serviceName as string);
      } else if (enabled !== undefined) {
        const isEnabled = enabled === 'true';
        rules = isEnabled 
          ? this.routerService.getActiveRoutingRules()
          : this.routerService.getAllRoutingRules().filter(rule => !rule.enabled);
      } else {
        rules = this.routerService.getAllRoutingRules();
      }

      res.json({
        rules,
        count: rules.length
      });

    } catch (error) {
      this.logger.error('라우팅 규칙 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get routing rules'
      });
    }
  };

  /**
   * 라우팅 규칙 업데이트
   */
  updateRoutingRule = async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;
      
      updates.id = ruleId;
      updates.updatedAt = new Date();

      const success = this.routerService.updateRoutingRule(updates);
      
      if (!success) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Routing rule ${ruleId} not found`
        });
      }

      res.json({
        message: 'Routing rule updated successfully',
        ruleId
      });

    } catch (error) {
      this.logger.error('라우팅 규칙 업데이트 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update routing rule'
      });
    }
  };

  /**
   * 라우팅 규칙 삭제
   */
  deleteRoutingRule = async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      const success = this.routerService.removeRoutingRule(ruleId);
      
      if (!success) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Routing rule ${ruleId} not found`
        });
      }

      res.json({
        message: 'Routing rule deleted successfully',
        ruleId
      });

    } catch (error) {
      this.logger.error('라우팅 규칙 삭제 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete routing rule'
      });
    }
  };

  /**
   * 라우팅 규칙 활성화/비활성화
   */
  toggleRoutingRule = async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'enabled field must be a boolean'
        });
      }

      const success = this.routerService.toggleRoutingRule(ruleId, enabled);
      
      if (!success) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Routing rule ${ruleId} not found`
        });
      }

      res.json({
        message: `Routing rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        ruleId,
        enabled
      });

    } catch (error) {
      this.logger.error('라우팅 규칙 토글 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to toggle routing rule'
      });
    }
  };

  /**
   * Gateway 통계 조회
   */
  getStats = async (req: Request, res: Response) => {
    try {
      const routingStats = this.routerService.getRoutingStats();
      const loadBalancerStats = this.loadBalancer.getLoadBalancerStats();
      const circuitBreakerStatus = this.proxyService.getCircuitBreakerStatus();
      
      const services = this.serviceRegistry.getAllServices();
      const serviceStats = services.map(service => ({
        name: service.name,
        ...this.serviceRegistry.getServiceStats(service.name)
      }));

      res.json({
        routing: routingStats,
        loadBalancer: loadBalancerStats,
        circuitBreakers: circuitBreakerStatus,
        services: serviceStats
      });

    } catch (error) {
      this.logger.error('통계 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get stats'
      });
    }
  };

  /**
   * Circuit Breaker 리셋
   */
  resetCircuitBreaker = async (req: Request, res: Response) => {
    try {
      const { endpointId } = req.params;
      const success = this.proxyService.resetCircuitBreaker(endpointId);
      
      if (!success) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Circuit breaker for endpoint ${endpointId} not found`
        });
      }

      res.json({
        message: 'Circuit breaker reset successfully',
        endpointId
      });

    } catch (error) {
      this.logger.error('Circuit Breaker 리셋 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reset circuit breaker'
      });
    }
  };
}