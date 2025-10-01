import { Request, Response } from 'express';
import { TenantResolverService } from '../services/TenantResolverService';
import { Logger } from '@shared/common-libs';

export class TenantController {
  constructor(
    private tenantResolver: TenantResolverService,
    private logger: Logger
  ) {}

  /**
   * 현재 테넌트 컨텍스트 조회
   */
  getCurrentTenant = async (req: Request, res: Response) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No tenant context found'
        });
      }

      res.json({
        tenantId: req.tenant.tenantId,
        projectCode: req.tenant.projectCode,
        subdomain: req.tenant.subdomain,
        organizationId: req.tenant.organizationId,
        region: req.tenant.region,
        environment: req.tenant.environment,
        tier: req.tenant.tier,
        features: req.tenant.features,
        quotas: req.tenant.quotas,
        metadata: req.tenant.metadata
      });

    } catch (error) {
      this.logger.error('현재 테넌트 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get tenant context'
      });
    }
  };

  /**
   * 테넌트 기능 목록 조회
   */
  getTenantFeatures = async (req: Request, res: Response) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No tenant context found'
        });
      }

      res.json({
        tenantId: req.tenant.tenantId,
        tier: req.tenant.tier,
        features: req.tenant.features,
        availableFeatures: this.getAvailableFeaturesByTier(req.tenant.tier!)
      });

    } catch (error) {
      this.logger.error('테넌트 기능 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get tenant features'
      });
    }
  };

  /**
   * 테넌트 쿼터 조회
   */
  getTenantQuotas = async (req: Request, res: Response) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No tenant context found'
        });
      }

      // TODO: 실제 사용량 조회
      const currentUsage = {
        users: 0,
        projects: 0,
        apiCalls: 0,
        storage: 0
      };

      res.json({
        tenantId: req.tenant.tenantId,
        tier: req.tenant.tier,
        quotas: req.tenant.quotas,
        currentUsage,
        utilizationRate: {
          users: (currentUsage.users / req.tenant.quotas.maxUsers) * 100,
          projects: (currentUsage.projects / req.tenant.quotas.maxProjects) * 100,
          apiCalls: (currentUsage.apiCalls / req.tenant.quotas.maxApiCalls) * 100,
          storage: (currentUsage.storage / req.tenant.quotas.maxStorage) * 100
        }
      });

    } catch (error) {
      this.logger.error('테넌트 쿼터 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get tenant quotas'
      });
    }
  };

  /**
   * 테넌트 설정 조회
   */
  getTenantSettings = async (req: Request, res: Response) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No tenant context found'
        });
      }

      // TODO: 실제 데이터베이스에서 테넌트 설정 조회
      const settings = {
        timezone: 'UTC',
        locale: 'en-US',
        allowMultipleProjects: true,
        enableAuditLogging: true,
        enableEncryption: false,
        dataRetentionDays: 90
      };

      res.json({
        tenantId: req.tenant.tenantId,
        settings
      });

    } catch (error) {
      this.logger.error('테넌트 설정 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get tenant settings'
      });
    }
  };

  /**
   * 테넌트 프로젝트 목록 조회
   */
  getTenantProjects = async (req: Request, res: Response) => {
    try {
      if (!req.tenant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No tenant context found'
        });
      }

      // TODO: 실제 데이터베이스에서 프로젝트 목록 조회
      const projects = [];

      res.json({
        tenantId: req.tenant.tenantId,
        projects,
        count: projects.length
      });

    } catch (error) {
      this.logger.error('테넌트 프로젝트 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get tenant projects'
      });
    }
  };

  /**
   * 테넌트 해결 통계 조회
   */
  getTenantStats = async (req: Request, res: Response) => {
    try {
      const metrics = this.tenantResolver.getMetrics();
      
      res.json({
        metrics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('테넌트 통계 조회 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get tenant statistics'
      });
    }
  };

  /**
   * 테넌트 캐시 정리
   */
  clearTenantCache = async (req: Request, res: Response) => {
    try {
      this.tenantResolver.clearCache();
      
      res.json({
        message: 'Tenant cache cleared successfully'
      });

    } catch (error) {
      this.logger.error('테넌트 캐시 정리 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to clear tenant cache'
      });
    }
  };

  /**
   * 테넌트 검증
   */
  validateTenant = async (req: Request, res: Response) => {
    try {
      const { tenantId, projectCode } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Tenant ID is required'
        });
      }

      const validationResult = await this.tenantResolver.validateAndCreateContext(
        tenantId,
        projectCode
      );

      if (!validationResult.valid) {
        return res.status(400).json({
          valid: false,
          error: validationResult.error,
          errorCode: validationResult.errorCode
        });
      }

      res.json({
        valid: true,
        tenant: {
          id: validationResult.tenant!.id,
          name: validationResult.tenant!.name,
          displayName: validationResult.tenant!.displayName,
          status: validationResult.tenant!.status,
          tier: validationResult.tenant!.tier,
          region: validationResult.tenant!.region,
          environment: validationResult.tenant!.environment
        },
        project: validationResult.project ? {
          id: validationResult.project.id,
          code: validationResult.project.code,
          name: validationResult.project.name,
          status: validationResult.project.status
        } : null,
        context: validationResult.context
      });

    } catch (error) {
      this.logger.error('테넌트 검증 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Tenant validation failed'
      });
    }
  };

  /**
   * 테넌트 해결 테스트
   */
  testTenantResolution = async (req: Request, res: Response) => {
    try {
      const resolutionResult = await this.tenantResolver.resolveTenant(req);
      
      res.json({
        resolution: resolutionResult,
        headers: {
          'x-tenant-id': req.headers['x-tenant-id'],
          'x-project-code': req.headers['x-project-code'],
          'host': req.headers.host,
          'authorization': req.headers.authorization ? 'Bearer [REDACTED]' : undefined
        },
        path: req.path,
        query: req.query
      });

    } catch (error) {
      this.logger.error('테넌트 해결 테스트 실패', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Tenant resolution test failed'
      });
    }
  };

  /**
   * 티어별 사용 가능한 기능 조회
   */
  private getAvailableFeaturesByTier(tier: string): string[] {
    const featuresByTier: Record<string, string[]> = {
      'free': ['basic_api', 'basic_dashboard'],
      'basic': ['basic_api', 'basic_dashboard', 'analytics', 'webhooks'],
      'premium': ['basic_api', 'basic_dashboard', 'analytics', 'webhooks', 'advanced_analytics', 'custom_domains'],
      'enterprise': ['basic_api', 'basic_dashboard', 'analytics', 'webhooks', 'advanced_analytics', 'custom_domains', 'sso', 'audit_logs', 'priority_support']
    };

    return featuresByTier[tier] || [];
  }
}