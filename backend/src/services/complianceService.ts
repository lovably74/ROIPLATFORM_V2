import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { SecurityScanner } from '../utils/securityScanner';
import { AccessibilityTester } from '../utils/accessibilityTester';
import { NotificationService } from './notificationService';

interface ComplianceCheckResult {
  checkId: string;
  status: 'compliant' | 'non_compliant' | 'pending' | 'not_applicable';
  evidence: string;
  recommendations: string[];
  riskScore: number;
  testDetails: Record<string, any>;
}

interface AccessibilityTestResult {
  guidelineId: string;
  status: 'pass' | 'fail' | 'pending' | 'not_applicable';
  pageUrl: string;
  elementSelector?: string;
  testResults: Record<string, any>;
  remediation: string[];
}

export class ComplianceService {
  private db: Pool;
  private securityScanner: SecurityScanner;
  private accessibilityTester: AccessibilityTester;
  private notificationService: NotificationService;

  constructor(database: Pool) {
    this.db = database;
    this.securityScanner = new SecurityScanner();
    this.accessibilityTester = new AccessibilityTester();
    this.notificationService = new NotificationService();
  }

  /**
   * 프로젝트의 모든 보안 컴플라이언스 검사 실행
   */
  async runSecurityComplianceChecks(projectCode: string, userId: string): Promise<ComplianceCheckResult[]> {
    try {
      logger.info(`Starting security compliance checks for project: ${projectCode}`);

      // 프로젝트의 모든 보안 체크리스트 가져오기
      const checksQuery = `
        SELECT scc.*, pcs.status as current_status
        FROM security_compliance_checks scc
        LEFT JOIN project_compliance_status pcs ON scc.id = pcs.check_id 
          AND pcs.project_code = $1
        WHERE scc.auto_checkable = true
        ORDER BY 
          CASE scc.severity 
            WHEN 'critical' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            ELSE 4 
          END
      `;

      const { rows: checks } = await this.db.query(checksQuery, [projectCode]);
      const results: ComplianceCheckResult[] = [];

      for (const check of checks) {
        const result = await this.executeSecurityCheck(check, projectCode);
        results.push(result);

        // 결과를 데이터베이스에 저장
        await this.saveComplianceResult(projectCode, check.id, result, userId);

        // 중요도가 높은 이슈 발견 시 알림 발송
        if (result.status === 'non_compliant' && check.severity === 'critical') {
          await this.notificationService.sendCriticalComplianceAlert(
            projectCode,
            check.check_title,
            result.evidence
          );
        }
      }

      // 감사 로그 기록
      await this.logAuditEvent({
        projectCode,
        userId,
        eventType: 'compliance_scan',
        eventCategory: 'security',
        resourceType: 'project',
        resourceId: projectCode,
        actionAttempted: 'automated_security_scan',
        result: 'success',
        additionalContext: {
          checksPerformed: results.length,
          criticalIssues: results.filter(r => r.riskScore >= 80).length
        }
      });

      logger.info(`Completed security compliance checks for project: ${projectCode}`, {
        totalChecks: results.length,
        compliant: results.filter(r => r.status === 'compliant').length,
        nonCompliant: results.filter(r => r.status === 'non_compliant').length
      });

      return results;
    } catch (error) {
      logger.error('Error running security compliance checks:', error);
      throw error;
    }
  }

  /**
   * 개별 보안 검사 실행
   */
  private async executeSecurityCheck(check: any, projectCode: string): Promise<ComplianceCheckResult> {
    try {
      let result: ComplianceCheckResult = {
        checkId: check.id,
        status: 'pending',
        evidence: '',
        recommendations: [],
        riskScore: 0,
        testDetails: {}
      };

      switch (check.check_category) {
        case 'kisa_secure_dev':
          result = await this.runKISASecurityCheck(check, projectCode);
          break;
        case 'zero_trust':
          result = await this.runZeroTrustCheck(check, projectCode);
          break;
        case 'kisa_vuln_scan':
          result = await this.runVulnerabilityCheck(check, projectCode);
          break;
        default:
          result.status = 'not_applicable';
          result.evidence = 'Check category not implemented for automated testing';
      }

      return result;
    } catch (error) {
      logger.error(`Error executing security check ${check.check_item_code}:`, error);
      return {
        checkId: check.id,
        status: 'non_compliant',
        evidence: `Error during automated check: ${error.message}`,
        recommendations: ['Manual verification required', 'Check system logs for details'],
        riskScore: 70,
        testDetails: { error: error.message }
      };
    }
  }

  /**
   * KISA 보안 개발 가이드 검사
   */
  private async runKISASecurityCheck(check: any, projectCode: string): Promise<ComplianceCheckResult> {
    const result: ComplianceCheckResult = {
      checkId: check.id,
      status: 'pending',
      evidence: '',
      recommendations: [],
      riskScore: 0,
      testDetails: {}
    };

    switch (check.check_item_code) {
      case 'INPUT_001': // SQL 인젝션 방지
        const sqlInjectionResult = await this.securityScanner.checkSQLInjection(projectCode);
        result.status = sqlInjectionResult.vulnerable ? 'non_compliant' : 'compliant';
        result.evidence = sqlInjectionResult.evidence;
        result.recommendations = sqlInjectionResult.recommendations;
        result.riskScore = sqlInjectionResult.riskScore;
        result.testDetails = sqlInjectionResult.details;
        break;

      case 'INPUT_002': // XSS 방지
        const xssResult = await this.securityScanner.checkXSS(projectCode);
        result.status = xssResult.vulnerable ? 'non_compliant' : 'compliant';
        result.evidence = xssResult.evidence;
        result.recommendations = xssResult.recommendations;
        result.riskScore = xssResult.riskScore;
        result.testDetails = xssResult.details;
        break;

      case 'AUTH_002': // 세션 관리 보안
        const sessionResult = await this.securityScanner.checkSessionSecurity(projectCode);
        result.status = sessionResult.secure ? 'compliant' : 'non_compliant';
        result.evidence = sessionResult.evidence;
        result.recommendations = sessionResult.recommendations;
        result.riskScore = sessionResult.riskScore;
        result.testDetails = sessionResult.details;
        break;

      case 'AUTH_003': // 비밀번호 정책
        const passwordResult = await this.securityScanner.checkPasswordPolicy(projectCode);
        result.status = passwordResult.compliant ? 'compliant' : 'non_compliant';
        result.evidence = passwordResult.evidence;
        result.recommendations = passwordResult.recommendations;
        result.riskScore = passwordResult.riskScore;
        result.testDetails = passwordResult.details;
        break;

      default:
        result.status = 'not_applicable';
        result.evidence = 'Automated check not implemented for this item';
    }

    return result;
  }

  /**
   * Zero Trust 검사
   */
  private async runZeroTrustCheck(check: any, projectCode: string): Promise<ComplianceCheckResult> {
    const result: ComplianceCheckResult = {
      checkId: check.id,
      status: 'pending',
      evidence: '',
      recommendations: [],
      riskScore: 0,
      testDetails: {}
    };

    switch (check.check_item_code) {
      case 'ZT_001': // 모든 접근 요청 검증
        const authResult = await this.securityScanner.checkAuthenticationRequirements(projectCode);
        result.status = authResult.compliant ? 'compliant' : 'non_compliant';
        result.evidence = authResult.evidence;
        result.recommendations = authResult.recommendations;
        result.riskScore = authResult.riskScore;
        result.testDetails = authResult.details;
        break;

      case 'ZT_003': // 지속적 신뢰 검증
        const trustResult = await this.securityScanner.checkContinuousTrustVerification(projectCode);
        result.status = trustResult.compliant ? 'compliant' : 'non_compliant';
        result.evidence = trustResult.evidence;
        result.recommendations = trustResult.recommendations;
        result.riskScore = trustResult.riskScore;
        result.testDetails = trustResult.details;
        break;

      default:
        result.status = 'not_applicable';
        result.evidence = 'Automated check not implemented for this Zero Trust item';
    }

    return result;
  }

  /**
   * 취약점 스캔 검사
   */
  private async runVulnerabilityCheck(check: any, projectCode: string): Promise<ComplianceCheckResult> {
    const scanResult = await this.securityScanner.runVulnerabilityScan(projectCode);
    
    return {
      checkId: check.id,
      status: scanResult.vulnerabilities.length === 0 ? 'compliant' : 'non_compliant',
      evidence: scanResult.evidence,
      recommendations: scanResult.recommendations,
      riskScore: scanResult.overallRiskScore,
      testDetails: scanResult
    };
  }

  /**
   * 웹 접근성 자동 검사 실행
   */
  async runAccessibilityTests(projectCode: string, userId: string, pageUrls?: string[]): Promise<AccessibilityTestResult[]> {
    try {
      logger.info(`Starting accessibility tests for project: ${projectCode}`);

      // 자동 검사 가능한 접근성 가이드라인 가져오기
      const guidelinesQuery = `
        SELECT ag.*, pas.status as current_status
        FROM accessibility_guidelines ag
        LEFT JOIN project_accessibility_status pas ON ag.id = pas.guideline_id 
          AND pas.project_code = $1
        WHERE ag.automated_test_possible = true
        ORDER BY ag.guideline_code
      `;

      const { rows: guidelines } = await this.db.query(guidelinesQuery, [projectCode]);
      
      // 검사할 페이지 URL 결정
      const urlsToTest = pageUrls || await this.getProjectUrls(projectCode);
      const results: AccessibilityTestResult[] = [];

      for (const url of urlsToTest) {
        for (const guideline of guidelines) {
          const result = await this.executeAccessibilityTest(guideline, url, projectCode);
          results.push(result);

          // 결과를 데이터베이스에 저장
          await this.saveAccessibilityResult(projectCode, guideline.id, url, result, userId);
        }
      }

      // 감사 로그 기록
      await this.logAuditEvent({
        projectCode,
        userId,
        eventType: 'accessibility_scan',
        eventCategory: 'accessibility',
        resourceType: 'project',
        resourceId: projectCode,
        actionAttempted: 'automated_accessibility_test',
        result: 'success',
        additionalContext: {
          testsPerformed: results.length,
          failedTests: results.filter(r => r.status === 'fail').length,
          urlsTested: urlsToTest.length
        }
      });

      logger.info(`Completed accessibility tests for project: ${projectCode}`, {
        totalTests: results.length,
        passed: results.filter(r => r.status === 'pass').length,
        failed: results.filter(r => r.status === 'fail').length
      });

      return results;
    } catch (error) {
      logger.error('Error running accessibility tests:', error);
      throw error;
    }
  }

  /**
   * 개별 접근성 검사 실행
   */
  private async executeAccessibilityTest(guideline: any, pageUrl: string, projectCode: string): Promise<AccessibilityTestResult> {
    try {
      let result: AccessibilityTestResult = {
        guidelineId: guideline.id,
        status: 'pending',
        pageUrl,
        testResults: {},
        remediation: []
      };

      switch (guideline.guideline_category) {
        case 'perceivable':
          result = await this.testPerceivableGuideline(guideline, pageUrl);
          break;
        case 'operable':
          result = await this.testOperableGuideline(guideline, pageUrl);
          break;
        case 'understandable':
          result = await this.testUnderstandableGuideline(guideline, pageUrl);
          break;
        case 'robust':
          result = await this.testRobustGuideline(guideline, pageUrl);
          break;
        default:
          result.status = 'not_applicable';
          result.testResults = { message: 'Category not implemented for automated testing' };
      }

      return result;
    } catch (error) {
      logger.error(`Error executing accessibility test for ${guideline.guideline_code}:`, error);
      return {
        guidelineId: guideline.id,
        status: 'fail',
        pageUrl,
        testResults: { error: error.message },
        remediation: ['Manual verification required', 'Check accessibility testing logs']
      };
    }
  }

  /**
   * 인식가능성 가이드라인 검사
   */
  private async testPerceivableGuideline(guideline: any, pageUrl: string): Promise<AccessibilityTestResult> {
    const result: AccessibilityTestResult = {
      guidelineId: guideline.id,
      status: 'pending',
      pageUrl,
      testResults: {},
      remediation: []
    };

    switch (guideline.guideline_code) {
      case '1.1.1': // 대체 텍스트
        const altTextResult = await this.accessibilityTester.checkAltText(pageUrl);
        result.status = altTextResult.passed ? 'pass' : 'fail';
        result.testResults = altTextResult.details;
        result.remediation = altTextResult.recommendations;
        if (altTextResult.missingAltElements.length > 0) {
          result.elementSelector = altTextResult.missingAltElements.join(', ');
        }
        break;

      case '1.4.3': // 색상 대비 (최소)
        const contrastResult = await this.accessibilityTester.checkColorContrast(pageUrl, 4.5);
        result.status = contrastResult.passed ? 'pass' : 'fail';
        result.testResults = contrastResult.details;
        result.remediation = contrastResult.recommendations;
        if (contrastResult.failingElements.length > 0) {
          result.elementSelector = contrastResult.failingElements.map(e => e.selector).join(', ');
        }
        break;

      case '1.4.6': // 색상 대비 (향상)
        const enhancedContrastResult = await this.accessibilityTester.checkColorContrast(pageUrl, 7);
        result.status = enhancedContrastResult.passed ? 'pass' : 'fail';
        result.testResults = enhancedContrastResult.details;
        result.remediation = enhancedContrastResult.recommendations;
        break;

      default:
        result.status = 'not_applicable';
        result.testResults = { message: 'Automated test not implemented for this perceivable guideline' };
    }

    return result;
  }

  /**
   * 운용가능성 가이드라인 검사
   */
  private async testOperableGuideline(guideline: any, pageUrl: string): Promise<AccessibilityTestResult> {
    const result: AccessibilityTestResult = {
      guidelineId: guideline.id,
      status: 'pending',
      pageUrl,
      testResults: {},
      remediation: []
    };

    switch (guideline.guideline_code) {
      case '2.1.1': // 키보드 접근성
        const keyboardResult = await this.accessibilityTester.checkKeyboardAccessibility(pageUrl);
        result.status = keyboardResult.passed ? 'pass' : 'fail';
        result.testResults = keyboardResult.details;
        result.remediation = keyboardResult.recommendations;
        break;

      case '2.1.2': // 키보드 트랩 없음
        const keyboardTrapResult = await this.accessibilityTester.checkKeyboardTraps(pageUrl);
        result.status = keyboardTrapResult.passed ? 'pass' : 'fail';
        result.testResults = keyboardTrapResult.details;
        result.remediation = keyboardTrapResult.recommendations;
        break;

      case '2.4.1': // 블록 건너뛰기
        const skipLinksResult = await this.accessibilityTester.checkSkipLinks(pageUrl);
        result.status = skipLinksResult.passed ? 'pass' : 'fail';
        result.testResults = skipLinksResult.details;
        result.remediation = skipLinksResult.recommendations;
        break;

      default:
        result.status = 'not_applicable';
        result.testResults = { message: 'Automated test not implemented for this operable guideline' };
    }

    return result;
  }

  /**
   * 이해가능성 가이드라인 검사
   */
  private async testUnderstandableGuideline(guideline: any, pageUrl: string): Promise<AccessibilityTestResult> {
    const result: AccessibilityTestResult = {
      guidelineId: guideline.id,
      status: 'pending',
      pageUrl,
      testResults: {},
      remediation: []
    };

    switch (guideline.guideline_code) {
      case '3.1.1': // 페이지 언어
        const langResult = await this.accessibilityTester.checkPageLanguage(pageUrl);
        result.status = langResult.passed ? 'pass' : 'fail';
        result.testResults = langResult.details;
        result.remediation = langResult.recommendations;
        break;

      case '3.2.1': // 포커스 시 컨텍스트 변경 없음
        const focusResult = await this.accessibilityTester.checkFocusContextChange(pageUrl);
        result.status = focusResult.passed ? 'pass' : 'fail';
        result.testResults = focusResult.details;
        result.remediation = focusResult.recommendations;
        break;

      default:
        result.status = 'not_applicable';
        result.testResults = { message: 'Automated test not implemented for this understandable guideline' };
    }

    return result;
  }

  /**
   * 견고성 가이드라인 검사
   */
  private async testRobustGuideline(guideline: any, pageUrl: string): Promise<AccessibilityTestResult> {
    const result: AccessibilityTestResult = {
      guidelineId: guideline.id,
      status: 'pending',
      pageUrl,
      testResults: {},
      remediation: []
    };

    switch (guideline.guideline_code) {
      case '4.1.1': // 구문 분석
        const markupResult = await this.accessibilityTester.checkMarkupValidity(pageUrl);
        result.status = markupResult.passed ? 'pass' : 'fail';
        result.testResults = markupResult.details;
        result.remediation = markupResult.recommendations;
        break;

      case '4.1.2': // 이름, 역할, 값
        const ariaResult = await this.accessibilityTester.checkARIAAttributes(pageUrl);
        result.status = ariaResult.passed ? 'pass' : 'fail';
        result.testResults = ariaResult.details;
        result.remediation = ariaResult.recommendations;
        break;

      default:
        result.status = 'not_applicable';
        result.testResults = { message: 'Automated test not implemented for this robust guideline' };
    }

    return result;
  }

  /**
   * 컴플라이언스 결과 저장
   */
  private async saveComplianceResult(
    projectCode: string, 
    checkId: string, 
    result: ComplianceCheckResult, 
    userId: string
  ): Promise<void> {
    const query = `
      INSERT INTO project_compliance_status (
        project_code, check_id, status, last_checked_at, checked_by, 
        evidence_text, remediation_status
      ) VALUES ($1, $2, $3, NOW(), $4, $5, $6)
      ON CONFLICT (project_code, check_id) 
      DO UPDATE SET 
        status = $3,
        last_checked_at = NOW(),
        checked_by = $4,
        evidence_text = $5,
        remediation_status = $6,
        updated_at = NOW()
    `;

    await this.db.query(query, [
      projectCode,
      checkId,
      result.status,
      userId,
      result.evidence,
      result.status === 'non_compliant' ? 'not_started' : 'completed'
    ]);
  }

  /**
   * 접근성 결과 저장
   */
  private async saveAccessibilityResult(
    projectCode: string,
    guidelineId: string,
    pageUrl: string,
    result: AccessibilityTestResult,
    userId: string
  ): Promise<void> {
    const query = `
      INSERT INTO project_accessibility_status (
        project_code, guideline_id, page_url, element_selector, status,
        test_method, tested_at, tested_by, test_result_details, 
        remediation_notes, remediation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)
      ON CONFLICT (project_code, guideline_id, page_url, element_selector) 
      DO UPDATE SET 
        status = $5,
        tested_at = NOW(),
        tested_by = $7,
        test_result_details = $8,
        remediation_notes = $9,
        remediation_status = $10,
        updated_at = NOW()
    `;

    await this.db.query(query, [
      projectCode,
      guidelineId,
      pageUrl,
      result.elementSelector || '',
      result.status,
      'automated',
      userId,
      JSON.stringify(result.testResults),
      result.remediation.join('; '),
      result.status === 'fail' ? 'not_started' : 'completed'
    ]);
  }

  /**
   * 프로젝트의 페이지 URL 목록 가져오기
   */
  private async getProjectUrls(projectCode: string): Promise<string[]> {
    // 실제 구현에서는 프로젝트의 사이트맵이나 설정에서 URL 목록을 가져올 것
    // 여기서는 기본 URL들을 반환
    const projectQuery = `
      SELECT base_url FROM projects WHERE project_code = $1
    `;
    
    const { rows } = await this.db.query(projectQuery, [projectCode]);
    if (rows.length === 0) {
      return [];
    }

    const baseUrl = rows[0].base_url;
    return [
      baseUrl,
      `${baseUrl}/login`,
      `${baseUrl}/dashboard`,
      `${baseUrl}/profile`,
      `${baseUrl}/settings`
    ];
  }

  /**
   * 감사 이벤트 로그 기록
   */
  private async logAuditEvent(eventData: any): Promise<void> {
    const query = `
      INSERT INTO security_audit_events (
        project_code, event_type, event_category, user_id, 
        resource_type, resource_id, action_attempted, result,
        additional_context, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `;

    await this.db.query(query, [
      eventData.projectCode,
      eventData.eventType,
      eventData.eventCategory,
      eventData.userId,
      eventData.resourceType,
      eventData.resourceId,
      eventData.actionAttempted,
      eventData.result,
      JSON.stringify(eventData.additionalContext)
    ]);
  }

  /**
   * 스케줄링된 컴플라이언스 검사
   */
  async runScheduledComplianceChecks(): Promise<void> {
    try {
      logger.info('Starting scheduled compliance checks');

      // 활성 프로젝트 목록 가져오기
      const projectsQuery = `
        SELECT project_code, name, created_by 
        FROM projects 
        WHERE status = 'active' 
        AND automated_compliance_enabled = true
      `;

      const { rows: projects } = await this.db.query(projectsQuery);

      for (const project of projects) {
        try {
          // 보안 컴플라이언스 검사
          await this.runSecurityComplianceChecks(project.project_code, 'system');
          
          // 접근성 검사
          await this.runAccessibilityTests(project.project_code, 'system');

          logger.info(`Completed scheduled checks for project: ${project.project_code}`);
        } catch (error) {
          logger.error(`Error in scheduled checks for project ${project.project_code}:`, error);
        }
      }

      logger.info('Completed all scheduled compliance checks');
    } catch (error) {
      logger.error('Error in scheduled compliance checks:', error);
    }
  }
}