import { Request, Response, NextFunction } from 'express';
import { Logger } from '@shared/common-libs';

export interface ErrorConfig {
  includeStackTrace: boolean;
  enableErrorReporting: boolean;
  enableAuditLogging: boolean;
  customErrorMessages: Record<string, string>;
  enableSanitization: boolean;
}

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string | number;
  timestamp: string;
  requestId: string;
  path: string;
  method: string;
  details?: any;
  stackTrace?: string;
}

export class ErrorMiddleware {
  private logger: Logger;
  private config: ErrorConfig;
  private errorStats = {
    totalErrors: 0,
    errorsByStatusCode: {} as Record<number, number>,
    errorsByType: {} as Record<string, number>
  };

  constructor(logger: Logger, config: ErrorConfig) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * 전역 에러 핸들러 미들웨어
   */
  createErrorHandler() {
    return (error: any, req: Request, res: Response, next: NextFunction) => {
      try {
        this.errorStats.totalErrors++;
        
        const errorInfo = this.analyzeError(error);
        const statusCode = errorInfo.statusCode || 500;
        
        // 통계 업데이트
        this.errorStats.errorsByStatusCode[statusCode] = 
          (this.errorStats.errorsByStatusCode[statusCode] || 0) + 1;
        this.errorStats.errorsByType[errorInfo.type] = 
          (this.errorStats.errorsByType[errorInfo.type] || 0) + 1;

        // 에러 로깅
        this.logError(error, req, errorInfo);

        // 감사 로깅
        if (this.config.enableAuditLogging) {
          this.auditError(error, req, errorInfo);
        }

        // 에러 응답 생성
        const errorResponse = this.createErrorResponse(error, req, errorInfo);

        // 응답 전송
        if (!res.headersSent) {
          res.status(statusCode).json(errorResponse);
        }

      } catch (handlerError) {
        this.logger.error('에러 핸들러에서 오류 발생', handlerError);
        
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          });
        }
      }
    };
  }

  /**
   * 404 Not Found 핸들러
   */
  createNotFoundHandler() {
    return (req: Request, res: Response, next: NextFunction) => {
      const error = {
        name: 'NotFoundError',
        message: `Route ${req.method} ${req.path} not found`,
        statusCode: 404
      };

      const errorResponse = this.createErrorResponse(error, req, {
        type: 'NotFoundError',
        statusCode: 404,
        isOperational: true
      });

      this.logger.warn('404 Not Found', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(404).json(errorResponse);
    };
  }

  /**
   * 비동기 에러 캐처
   */
  catchAsync(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * 유효성 검사 에러 핸들러
   */
  handleValidationError() {
    return (req: Request, res: Response, next: NextFunction) => {
      const validationErrors = (req as any).validationErrors;
      
      if (validationErrors && validationErrors.length > 0) {
        const error = {
          name: 'ValidationError',
          message: 'Request validation failed',
          statusCode: 400,
          details: validationErrors
        };

        const errorResponse = this.createErrorResponse(error, req, {
          type: 'ValidationError',
          statusCode: 400,
          isOperational: true
        });

        return res.status(400).json(errorResponse);
      }

      next();
    };
  }

  /**
   * 에러 분석
   */
  private analyzeError(error: any): {
    type: string;
    statusCode: number;
    isOperational: boolean;
  } {
    // 커스텀 에러 타입들
    if (error.name === 'ValidationError') {
      return { type: 'ValidationError', statusCode: 400, isOperational: true };
    }
    
    if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
      return { type: 'AuthenticationError', statusCode: 401, isOperational: true };
    }
    
    if (error.name === 'ForbiddenError') {
      return { type: 'AuthorizationError', statusCode: 403, isOperational: true };
    }
    
    if (error.name === 'NotFoundError') {
      return { type: 'NotFoundError', statusCode: 404, isOperational: true };
    }
    
    if (error.name === 'ConflictError') {
      return { type: 'ConflictError', statusCode: 409, isOperational: true };
    }
    
    if (error.name === 'TooManyRequestsError') {
      return { type: 'RateLimitError', statusCode: 429, isOperational: true };
    }

    // MongoDB 에러
    if (error.name === 'MongoError') {
      if (error.code === 11000) {
        return { type: 'DuplicateError', statusCode: 409, isOperational: true };
      }
      return { type: 'DatabaseError', statusCode: 500, isOperational: false };
    }

    // Sequelize 에러
    if (error.name && error.name.includes('Sequelize')) {
      return { type: 'DatabaseError', statusCode: 500, isOperational: false };
    }

    // HTTP 상태 코드가 있는 에러
    if (error.statusCode) {
      return {
        type: error.name || 'HTTPError',
        statusCode: error.statusCode,
        isOperational: error.isOperational !== false
      };
    }

    // 기본 처리되지 않은 에러
    return { type: 'UnhandledError', statusCode: 500, isOperational: false };
  }

  /**
   * 에러 응답 생성
   */
  private createErrorResponse(error: any, req: Request, errorInfo: any): ErrorResponse {
    const requestId = req.headers['x-request-id'] as string || 'unknown';
    
    let message = error.message || 'An error occurred';
    
    // 커스텀 에러 메시지 적용
    if (this.config.customErrorMessages[errorInfo.type]) {
      message = this.config.customErrorMessages[errorInfo.type];
    }

    // 메시지 정화 (개발 환경이 아닌 경우)
    if (this.config.enableSanitization && !errorInfo.isOperational) {
      message = 'Internal server error';
    }

    const errorResponse: ErrorResponse = {
      error: this.getErrorName(errorInfo.statusCode),
      message,
      code: error.code || errorInfo.statusCode,
      timestamp: new Date().toISOString(),
      requestId,
      path: req.path,
      method: req.method
    };

    // 상세 정보 추가 (운영 에러인 경우)
    if (errorInfo.isOperational && error.details) {
      errorResponse.details = error.details;
    }

    // 스택 트레이스 추가 (개발 환경)
    if (this.config.includeStackTrace && error.stack) {
      errorResponse.stackTrace = error.stack;
    }

    return errorResponse;
  }

  /**
   * 에러 로깅
   */
  private logError(error: any, req: Request, errorInfo: any): void {
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      },
      request: {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: this.sanitizeHeaders(req.headers),
        ip: req.ip,
        userAgent: req.headers['user-agent']
      },
      user: req.auth?.user?.id || req.user?.id,
      tenant: req.tenant?.tenantId,
      requestId: req.headers['x-request-id']
    };

    if (errorInfo.isOperational) {
      this.logger.warn('운영 에러 발생', logData);
    } else {
      this.logger.error('시스템 에러 발생', logData);
    }
  }

  /**
   * 감사 로깅
   */
  private auditError(error: any, req: Request, errorInfo: any): void {
    // TODO: 실제 감사 로그 시스템에 기록
    const auditData = {
      action: 'ERROR',
      resource: req.path,
      method: req.method,
      userId: req.auth?.user?.id || req.user?.id,
      tenantId: req.tenant?.tenantId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      error: {
        type: errorInfo.type,
        message: error.message,
        statusCode: errorInfo.statusCode
      },
      timestamp: new Date(),
      requestId: req.headers['x-request-id']
    };

    this.logger.info('에러 감사 로그', auditData);
  }

  /**
   * 헤더 정화 (민감한 정보 제거)
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * HTTP 상태 코드에 따른 에러 이름 반환
   */
  private getErrorName(statusCode: number): string {
    const errorNames: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };

    return errorNames[statusCode] || 'Error';
  }

  /**
   * 에러 통계 조회
   */
  getErrorStats() {
    return {
      ...this.errorStats,
      topErrors: Object.entries(this.errorStats.errorsByType)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      topStatusCodes: Object.entries(this.errorStats.errorsByStatusCode)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    };
  }

  /**
   * 에러 통계 초기화
   */
  resetStats(): void {
    this.errorStats = {
      totalErrors: 0,
      errorsByStatusCode: {},
      errorsByType: {}
    };
  }
}

/**
 * 커스텀 에러 클래스들
 */
export class OperationalError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean = true;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends OperationalError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
  }
}

export class AuthenticationError extends OperationalError {
  constructor(message: string = 'Authentication required') {
    super(message, 401);
  }
}

export class AuthorizationError extends OperationalError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends OperationalError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends OperationalError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409);
  }
}

export class TooManyRequestsError extends OperationalError {
  constructor(message: string = 'Too many requests') {
    super(message, 429);
  }
}