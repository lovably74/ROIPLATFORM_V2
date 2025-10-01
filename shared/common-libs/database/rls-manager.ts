import { TenantContextManager } from '../security/tenant-context';

/**
 * RLS 정책 타입
 */
export enum RLSPolicyType {
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ALL = 'ALL'
}

/**
 * RLS 정책 정의
 */
export interface RLSPolicy {
  tableName: string;
  policyName: string;
  operation: RLSPolicyType;
  expression: string;
  roles?: string[];
}

/**
 * RLS 관리 클래스
 */
export class RLSManager {
  
  /**
   * 기본 테넌트 격리 정책들
   */
  private static readonly TENANT_ISOLATION_POLICIES: RLSPolicy[] = [
    // 사용자 테이블
    {
      tableName: 'users',
      policyName: 'tenant_isolation_users',
      operation: RLSPolicyType.ALL,
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid'
    },
    
    // 프로젝트 테이블
    {
      tableName: 'projects',
      policyName: 'tenant_isolation_projects',
      operation: RLSPolicyType.ALL,
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid'
    },
    
    // 문서 테이블
    {
      tableName: 'documents',
      policyName: 'tenant_isolation_documents',
      operation: RLSPolicyType.ALL,
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid'
    },
    
    // 감사 로그 테이블
    {
      tableName: 'audit_logs',
      policyName: 'tenant_isolation_audit_logs',
      operation: RLSPolicyType.SELECT,
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid'
    },
    
    // 사용량 통계 테이블
    {
      tableName: 'usage_monthly',
      policyName: 'tenant_isolation_usage',
      operation: RLSPolicyType.ALL,
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid'
    }
  ];

  /**
   * 역할 기반 접근 제어 정책들
   */
  private static readonly RBAC_POLICIES: RLSPolicy[] = [
    // 관리자만 테넌트 테이블 접근
    {
      tableName: 'tenants',
      policyName: 'admin_only_tenants',
      operation: RLSPolicyType.ALL,
      expression: 'current_setting(\'app.current_user_role\') = \'ADMIN\'',
      roles: ['ADMIN']
    },
    
    // 프로젝트 관리자만 프로젝트 수정 가능
    {
      tableName: 'projects',
      policyName: 'project_manager_update',
      operation: RLSPolicyType.UPDATE,
      expression: `
        tenant_id = current_setting('app.current_tenant_id')::uuid AND
        (manager_id = current_setting('app.current_user_id')::uuid OR
         current_setting('app.current_user_role') IN ('ADMIN', 'PROJECT_MANAGER'))
      `
    },
    
    // 문서 소유자만 삭제 가능
    {
      tableName: 'documents',
      policyName: 'document_owner_delete',
      operation: RLSPolicyType.DELETE,
      expression: `
        tenant_id = current_setting('app.current_tenant_id')::uuid AND
        created_by = current_setting('app.current_user_id')::uuid
      `
    }
  ];

  /**
   * RLS 활성화를 위한 SQL 문 생성
   */
  static generateEnableRLSStatements(): string[] {
    const statements: string[] = [];
    
    // 테이블별 RLS 활성화
    const tables = ['tenants', 'users', 'projects', 'documents', 'audit_logs', 'usage_monthly'];
    
    for (const table of tables) {
      statements.push(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
    
    return statements;
  }

  /**
   * 기본 정책 생성을 위한 SQL 문 생성
   */
  static generatePolicyStatements(): string[] {
    const statements: string[] = [];
    const allPolicies = [...this.TENANT_ISOLATION_POLICIES, ...this.RBAC_POLICIES];
    
    for (const policy of allPolicies) {
      // 기존 정책 삭제
      statements.push(`DROP POLICY IF EXISTS ${policy.policyName} ON ${policy.tableName};`);
      
      // 새 정책 생성
      const roleClause = policy.roles ? ` TO ${policy.roles.join(', ')}` : '';
      statements.push(`
        CREATE POLICY ${policy.policyName}
        ON ${policy.tableName}
        FOR ${policy.operation}${roleClause}
        USING (${policy.expression});
      `);
    }
    
    return statements;
  }

  /**
   * 컨텍스트 설정을 위한 SQL 함수 생성
   */
  static generateContextFunctions(): string[] {
    return [
      `
      CREATE OR REPLACE FUNCTION set_tenant_context(
        p_tenant_id UUID,
        p_user_id UUID DEFAULT NULL,
        p_user_role TEXT DEFAULT NULL
      ) RETURNS void AS $$
      BEGIN
        PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, true);
        IF p_user_id IS NOT NULL THEN
          PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);
        END IF;
        IF p_user_role IS NOT NULL THEN
          PERFORM set_config('app.current_user_role', p_user_role, true);
        END IF;
      END;
      $$ LANGUAGE plpgsql;
      `,
      
      `
      CREATE OR REPLACE FUNCTION clear_tenant_context() RETURNS void AS $$
      BEGIN
        PERFORM set_config('app.current_tenant_id', NULL, true);
        PERFORM set_config('app.current_user_id', NULL, true);
        PERFORM set_config('app.current_user_role', NULL, true);
      END;
      $$ LANGUAGE plpgsql;
      `,
      
      `
      CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
      BEGIN
        RETURN current_setting('app.current_tenant_id', true)::UUID;
      EXCEPTION
        WHEN OTHERS THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      `
    ];
  }

  /**
   * 데이터베이스 세션에 테넌트 컨텍스트 설정
   */
  static async setDatabaseContext(client: any): Promise<void> {
    const context = TenantContextManager.get();
    if (!context) {
      throw new Error('Tenant context not available');
    }

    await client.query(
      'SELECT set_tenant_context($1, $2, $3)',
      [
        context.tenantId,
        context.userId || null,
        this.determinePrimaryRole(context.userRoles || [])
      ]
    );
  }

  /**
   * 데이터베이스 세션에서 테넌트 컨텍스트 제거
   */
  static async clearDatabaseContext(client: any): Promise<void> {
    await client.query('SELECT clear_tenant_context()');
  }

  /**
   * 사용자의 주요 역할 결정
   */
  private static determinePrimaryRole(roles: string[]): string | null {
    const roleHierarchy = ['ADMIN', 'TENANT_OWNER', 'PROJECT_MANAGER', 'POWER_USER', 'MEMBER', 'GUEST'];
    
    for (const role of roleHierarchy) {
      if (roles.includes(role)) {
        return role;
      }
    }
    
    return null;
  }

  /**
   * 테넌트 격리 검증
   */
  static async verifyTenantIsolation(client: any, tableName: string, recordId: string): Promise<boolean> {
    const context = TenantContextManager.requireContext();
    
    try {
      const result = await client.query(
        `SELECT 1 FROM ${tableName} WHERE id = $1 AND tenant_id = $2`,
        [recordId, context.tenantId]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * RLS 정책 상태 확인
   */
  static async checkRLSStatus(client: any): Promise<{[tableName: string]: boolean}> {
    const result = await client.query(`
      SELECT 
        schemaname,
        tablename,
        rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('tenants', 'users', 'projects', 'documents', 'audit_logs', 'usage_monthly')
    `);

    const status: {[tableName: string]: boolean} = {};
    
    for (const row of result.rows) {
      status[row.tablename] = row.rowsecurity;
    }
    
    return status;
  }

  /**
   * 정책 목록 조회
   */
  static async getPolicies(client: any): Promise<any[]> {
    const result = await client.query(`
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies 
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);

    return result.rows;
  }
}

/**
 * 데이터베이스 쿼리 래퍼 (자동 컨텍스트 설정)
 */
export class TenantAwareQuery {
  
  static async execute<T>(
    client: any,
    query: string,
    params: any[] = []
  ): Promise<T> {
    // 컨텍스트 설정
    await RLSManager.setDatabaseContext(client);
    
    try {
      // 쿼리 실행
      const result = await client.query(query, params);
      return result;
    } finally {
      // 컨텍스트 정리 (옵션)
      // await RLSManager.clearDatabaseContext(client);
    }
  }
  
  static async transaction<T>(
    client: any,
    callback: (client: any) => Promise<T>
  ): Promise<T> {
    await client.query('BEGIN');
    
    try {
      // 컨텍스트 설정
      await RLSManager.setDatabaseContext(client);
      
      // 트랜잭션 실행
      const result = await callback(client);
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

export default RLSManager;