import { AsyncLocalStorage } from 'async_hooks';

/**
 * 테넌트 컨텍스트 정보
 */
export interface TenantContext {
  tenantId: string;
  projectCode: string;
  userId?: string;
  userRoles?: string[];
  userPermissions?: string[];
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
}

/**
 * 요청별 컨텍스트 저장소
 */
const asyncLocalStorage = new AsyncLocalStorage<TenantContext>();

/**
 * 테넌트 컨텍스트 관리 클래스
 */
export class TenantContextManager {
  
  /**
   * 컨텍스트 설정 및 실행
   */
  static run<T>(context: TenantContext, callback: () => T): T {
    const enrichedContext: TenantContext = {
      ...context,
      timestamp: new Date()
    };
    
    return asyncLocalStorage.run(enrichedContext, callback);
  }

  /**
   * 현재 컨텍스트 가져오기
   */
  static get(): TenantContext | undefined {
    return asyncLocalStorage.getStore();
  }

  /**
   * 현재 테넌트 ID 가져오기
   */
  static getTenantId(): string | undefined {
    const context = asyncLocalStorage.getStore();
    return context?.tenantId;
  }

  /**
   * 현재 프로젝트 코드 가져오기
   */
  static getProjectCode(): string | undefined {
    const context = asyncLocalStorage.getStore();
    return context?.projectCode;
  }

  /**
   * 현재 사용자 ID 가져오기
   */
  static getUserId(): string | undefined {
    const context = asyncLocalStorage.getStore();
    return context?.userId;
  }

  /**
   * 현재 요청 ID 가져오기
   */
  static getRequestId(): string | undefined {
    const context = asyncLocalStorage.getStore();
    return context?.requestId;
  }

  /**
   * 사용자 권한 확인
   */
  static hasRole(role: string): boolean {
    const context = asyncLocalStorage.getStore();
    return context?.userRoles?.includes(role) ?? false;
  }

  /**
   * 사용자 권한 확인 (여러 개 중 하나)
   */
  static hasAnyRole(roles: string[]): boolean {
    const context = asyncLocalStorage.getStore();
    if (!context?.userRoles) return false;
    return roles.some(role => context.userRoles!.includes(role));
  }

  /**
   * 사용자 권한 확인 (모든 권한 필요)
   */
  static hasAllRoles(roles: string[]): boolean {
    const context = asyncLocalStorage.getStore();
    if (!context?.userRoles) return false;
    return roles.every(role => context.userRoles!.includes(role));
  }

  /**
   * 사용자 권한 확인
   */
  static hasPermission(permission: string): boolean {
    const context = asyncLocalStorage.getStore();
    return context?.userPermissions?.includes(permission) ?? false;
  }

  /**
   * 컨텍스트 유효성 검증
   */
  static isValid(): boolean {
    const context = asyncLocalStorage.getStore();
    return !!(context?.tenantId && context?.projectCode);
  }

  /**
   * 컨텍스트 필수 필드 검증
   */
  static requireContext(): TenantContext {
    const context = asyncLocalStorage.getStore();
    if (!context) {
      throw new Error('Tenant context is not set');
    }
    if (!context.tenantId) {
      throw new Error('Tenant ID is required in context');
    }
    if (!context.projectCode) {
      throw new Error('Project code is required in context');
    }
    return context;
  }

  /**
   * 컨텍스트 정보를 로그용 객체로 변환
   */
  static toLogContext(): Partial<TenantContext> {
    const context = asyncLocalStorage.getStore();
    if (!context) return {};

    return {
      tenantId: context.tenantId,
      projectCode: context.projectCode,
      userId: context.userId,
      requestId: context.requestId,
      ipAddress: context.ipAddress
    };
  }
}

/**
 * Express 미들웨어용 컨텍스트 설정
 */
export interface RequestWithContext extends Request {
  tenantContext?: TenantContext;
}

/**
 * 테넌트 컨텍스트 미들웨어 생성
 */
export function createTenantContextMiddleware() {
  return (req: any, res: any, next: any) => {
    // 헤더에서 테넌트 정보 추출
    const tenantId = req.headers['x-tenant-id'] as string;
    const projectCode = req.headers['x-project-code'] as string;
    const userId = req.user?.id;
    const requestId = req.headers['x-request-id'] as string || generateRequestId();

    // URL에서 프로젝트 코드 추출 (fallback)
    const urlProjectCode = extractProjectCodeFromUrl(req.path);
    
    const context: TenantContext = {
      tenantId: tenantId || 'default',
      projectCode: projectCode || urlProjectCode || 'public',
      userId,
      userRoles: req.user?.roles || [],
      userPermissions: req.user?.permissions || [],
      requestId,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    // 컨텍스트에 저장
    req.tenantContext = context;

    // AsyncLocalStorage에서 실행
    TenantContextManager.run(context, () => {
      next();
    });
  };
}

/**
 * URL에서 프로젝트 코드 추출
 */
function extractProjectCodeFromUrl(path: string): string | undefined {
  // /project-code/... 형태에서 project-code 추출
  const match = path.match(/^\/([a-zA-Z][a-zA-Z0-9-_]{3,49})(\/|$)/);
  return match ? match[1] : undefined;
}

/**
 * 요청 ID 생성
 */
function generateRequestId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 테넌트 격리 검증 데코레이터
 */
export function RequireTenantContext(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  
  descriptor.value = function (...args: any[]) {
    TenantContextManager.requireContext();
    return method.apply(this, args);
  };
}

/**
 * 권한 검증 데코레이터
 */
export function RequireRoles(...roles: string[]) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      if (!TenantContextManager.hasAnyRole(roles)) {
        throw new Error(`Insufficient permissions. Required roles: ${roles.join(', ')}`);
      }
      return method.apply(this, args);
    };
  };
}

/**
 * 권한 검증 데코레이터
 */
export function RequirePermissions(...permissions: string[]) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const hasAllPermissions = permissions.every(permission => 
        TenantContextManager.hasPermission(permission)
      );
      
      if (!hasAllPermissions) {
        throw new Error(`Insufficient permissions. Required permissions: ${permissions.join(', ')}`);
      }
      return method.apply(this, args);
    };
  };
}

// 편의 함수들
export const getCurrentTenant = () => TenantContextManager.getTenantId();
export const getCurrentProject = () => TenantContextManager.getProjectCode();
export const getCurrentUser = () => TenantContextManager.getUserId();
export const getRequestId = () => TenantContextManager.getRequestId();
export const hasRole = (role: string) => TenantContextManager.hasRole(role);
export const hasPermission = (permission: string) => TenantContextManager.hasPermission(permission);

export default TenantContextManager;