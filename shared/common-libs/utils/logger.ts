import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

/**
 * 로그 레벨 정의
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug'
}

/**
 * 로그 컨텍스트 인터페이스
 */
export interface LogContext {
  tenantId?: string;
  projectCode?: string;
  userId?: string;
  requestId?: string;
  service?: string;
  action?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  statusCode?: number;
  [key: string]: any;
}

/**
 * 로그 메타데이터 인터페이스
 */
export interface LogMeta extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  hostname: string;
  pid: number;
}

/**
 * CISP 통합 로깅 시스템
 */
export class CISPLogger {
  private logger: WinstonLogger;
  private serviceName: string;
  private environment: string;

  constructor(serviceName: string, options: {
    level?: LogLevel;
    environment?: string;
    logDir?: string;
    enableConsole?: boolean;
    enableFile?: boolean;
  } = {}) {
    this.serviceName = serviceName;
    this.environment = options.environment || process.env.NODE_ENV || 'development';

    const logLevel = options.level || this.getDefaultLogLevel();
    const logDir = options.logDir || path.join(process.cwd(), 'logs');

    // 커스텀 포맷 정의
    const customFormat = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      format.errors({ stack: true }),
      format.json(),
      format.printf((info: any) => {
        const meta: LogMeta = {
          timestamp: info.timestamp as string,
          level: info.level as LogLevel,
          message: info.message as string,
          service: this.serviceName,
          environment: this.environment,
          hostname: require('os').hostname(),
          pid: process.pid,
          ...(info as LogContext)
        };

        // 스택 트레이스 처리
        if (info.stack) {
          meta.stack = info.stack;
        }

        return JSON.stringify(meta);
      })
    );

    // Transport 설정
    const logTransports: any[] = [];

    // 콘솔 출력 (개발환경)
    if (options.enableConsole !== false && this.environment === 'development') {
      logTransports.push(
        new transports.Console({
          level: logLevel,
          format: format.combine(
            format.colorize(),
            format.timestamp({ format: 'HH:mm:ss' }),
            format.printf((info: any) => {
              const context = info.tenantId ? `[${info.tenantId}]` : '';
              const requestId = info.requestId ? `[${info.requestId}]` : '';
              return `${info.timestamp} [${info.level}] [${this.serviceName}]${context}${requestId}: ${info.message}`;
            })
          )
        })
      );
    }

    // 파일 출력
    if (options.enableFile !== false) {
      // 일반 로그 (info 이상)
      logTransports.push(
        new DailyRotateFile({
          level: 'info',
          filename: path.join(logDir, 'app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '100MB',
          maxFiles: '30d',
          format: customFormat
        })
      );

      // 에러 로그 (error만)
      logTransports.push(
        new DailyRotateFile({
          level: 'error',
          filename: path.join(logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '100MB',
          maxFiles: '90d',
          format: customFormat
        })
      );

      // HTTP 액세스 로그
      logTransports.push(
        new DailyRotateFile({
          level: 'http',
          filename: path.join(logDir, 'access-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '200MB',
          maxFiles: '30d',
          format: customFormat
        })
      );
    }

    this.logger = createLogger({
      level: logLevel,
      transports: logTransports,
      exitOnError: false
    });
  }

  /**
   * 환경별 기본 로그 레벨 결정
   */
  private getDefaultLogLevel(): LogLevel {
    switch (this.environment) {
      case 'production':
        return LogLevel.INFO;
      case 'staging':
        return LogLevel.INFO;
      case 'development':
      default:
        return LogLevel.DEBUG;
    }
  }

  /**
   * 에러 로그
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.logger.error(message, {
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  /**
   * 경고 로그
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  /**
   * 정보 로그
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  /**
   * HTTP 액세스 로그
   */
  http(message: string, context?: LogContext): void {
    this.logger.http(message, context);
  }

  /**
   * 디버그 로그
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }

  /**
   * 보안 이벤트 로그
   */
  security(event: string, context?: LogContext): void {
    this.logger.warn(`[SECURITY] ${event}`, {
      ...context,
      securityEvent: true
    });
  }

  /**
   * 감사 로그
   */
  audit(action: string, context?: LogContext): void {
    this.logger.info(`[AUDIT] ${action}`, {
      ...context,
      auditEvent: true
    });
  }

  /**
   * 성능 메트릭 로그
   */
  metric(name: string, value: number, unit: string = 'ms', context?: LogContext): void {
    this.logger.info(`[METRIC] ${name}: ${value}${unit}`, {
      ...context,
      metric: {
        name,
        value,
        unit
      }
    });
  }
}

/**
 * 글로벌 로거 인스턴스
 */
let globalLogger: CISPLogger;

/**
 * 로거 초기화
 */
export const initializeLogger = (serviceName: string, options?: {
  level?: LogLevel;
  environment?: string;
  logDir?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
}): CISPLogger => {
  globalLogger = new CISPLogger(serviceName, options);
  return globalLogger;
};

/**
 * 글로벌 로거 가져오기
 */
export const getLogger = (): CISPLogger => {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return globalLogger;
};

// 편의 함수들
export const log = {
  error: (message: string, error?: Error, context?: LogContext) => getLogger().error(message, error, context),
  warn: (message: string, context?: LogContext) => getLogger().warn(message, context),
  info: (message: string, context?: LogContext) => getLogger().info(message, context),
  http: (message: string, context?: LogContext) => getLogger().http(message, context),
  debug: (message: string, context?: LogContext) => getLogger().debug(message, context),
  security: (event: string, context?: LogContext) => getLogger().security(event, context),
  audit: (action: string, context?: LogContext) => getLogger().audit(action, context),
  metric: (name: string, value: number, unit?: string, context?: LogContext) => getLogger().metric(name, value, unit, context)
};

export default CISPLogger;