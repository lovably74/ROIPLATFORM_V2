import * as dotenv from 'dotenv';
import * as path from 'path';
import { z } from 'zod';

/**
 * 환경 타입
 */
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test'
}

/**
 * 로그 레벨
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug'
}

/**
 * 데이터베이스 설정 스키마
 */
const DatabaseConfigSchema = z.object({
  type: z.enum(['postgresql']).default('postgresql'),
  host: z.string().default('localhost'),
  port: z.number().int().positive().default(5432),
  database: z.string(),
  username: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
  maxConnections: z.number().int().positive().default(20),
  connectionTimeout: z.number().int().positive().default(30000)
});

/**
 * Redis 설정 스키마
 */
const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().positive().default(6379),
  password: z.string().optional(),
  database: z.number().int().min(0).max(15).default(0),
  keyPrefix: z.string().default('cisp:'),
  maxRetriesPerRequest: z.number().int().positive().default(3)
});

/**
 * JWT 설정 스키마
 */
const JWTConfigSchema = z.object({
  secret: z.string().min(32),
  expiresIn: z.string().default('24h'),
  refreshExpiresIn: z.string().default('7d'),
  issuer: z.string().default('CISP'),
  algorithm: z.enum(['HS256', 'HS384', 'HS512']).default('HS256')
});

/**
 * 서버 설정 스키마
 */
const ServerConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  cors: z.object({
    origin: z.array(z.string()).default(['http://localhost:3000']),
    credentials: z.boolean().default(true)
  }).default({}),
  rateLimit: z.object({
    windowMs: z.number().int().positive().default(900000), // 15분
    max: z.number().int().positive().default(100)
  }).default({})
});

/**
 * 파일 업로드 설정 스키마
 */
const FileConfigSchema = z.object({
  maxSize: z.number().int().positive().default(10485760), // 10MB
  allowedMimeTypes: z.array(z.string()).default([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]),
  uploadPath: z.string().default('./uploads'),
  tempPath: z.string().default('./temp')
});

/**
 * 전체 설정 스키마
 */
const ConfigSchema = z.object({
  // 기본 설정
  app: z.object({
    name: z.string().default('CISP'),
    version: z.string().default('1.0.0'),
    environment: z.nativeEnum(Environment).default(Environment.DEVELOPMENT),
    debug: z.boolean().default(false)
  }),
  
  // 서버 설정
  server: ServerConfigSchema,
  
  // 데이터베이스 설정
  database: DatabaseConfigSchema,
  
  // 캐시 설정
  redis: RedisConfigSchema,
  
  // 인증 설정
  jwt: JWTConfigSchema,
  
  // 로깅 설정
  logging: z.object({
    level: z.nativeEnum(LogLevel).default(LogLevel.INFO),
    enableFile: z.boolean().default(true),
    enableConsole: z.boolean().default(true),
    logDir: z.string().default('./logs'),
    maxFiles: z.string().default('30d'),
    maxSize: z.string().default('100MB')
  }),
  
  // 파일 설정
  file: FileConfigSchema,
  
  // 이메일 설정
  email: z.object({
    provider: z.enum(['smtp', 'sendgrid', 'mailgun']).default('smtp'),
    smtp: z.object({
      host: z.string().default('localhost'),
      port: z.number().int().positive().default(587),
      secure: z.boolean().default(false),
      auth: z.object({
        user: z.string().optional(),
        pass: z.string().optional()
      }).default({})
    }).default({})
  }),
  
  // 보안 설정
  security: z.object({
    bcryptRounds: z.number().int().positive().default(12),
    sessionSecret: z.string().min(32),
    csrfEnabled: z.boolean().default(true),
    helmetEnabled: z.boolean().default(true),
    httpsOnly: z.boolean().default(false)
  }),
  
  // 다국어 설정
  i18n: z.object({
    defaultLanguage: z.string().default('ko'),
    supportedLanguages: z.array(z.string()).default(['ko', 'en']),
    fallbackLanguage: z.string().default('ko')
  }),
  
  // 테넌시 설정
  tenancy: z.object({
    enabled: z.boolean().default(true),
    defaultTenantId: z.string().default('default'),
    rlsEnabled: z.boolean().default(true)
  })
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * 설정 관리 클래스
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor(serviceName?: string) {
    // 환경 파일 로드
    this.loadEnvFiles();
    
    // 설정 구성
    this.config = this.buildConfig(serviceName);
  }

  /**
   * 싱글톤 인스턴스 가져오기
   */
  public static getInstance(serviceName?: string): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(serviceName);
    }
    return ConfigManager.instance;
  }

  /**
   * 환경 파일들 로드
   */
  private loadEnvFiles(): void {
    const env = process.env.NODE_ENV || 'development';
    const envFiles = [
      `.env.${env}.local`,
      `.env.local`,
      `.env.${env}`,
      '.env'
    ];

    for (const file of envFiles) {
      const envPath = path.resolve(process.cwd(), file);
      dotenv.config({ path: envPath });
    }
  }

  /**
   * 설정 구성
   */
  private buildConfig(serviceName?: string): Config {
    const rawConfig = {
      app: {
        name: process.env.APP_NAME || serviceName || 'CISP',
        version: process.env.APP_VERSION || '1.0.0',
        environment: (process.env.NODE_ENV as Environment) || Environment.DEVELOPMENT,
        debug: process.env.APP_DEBUG === 'true'
      },
      
      server: {
        port: parseInt(process.env.APP_PORT || '3000', 10),
        host: process.env.APP_HOST || '0.0.0.0',
        cors: {
          origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
          credentials: process.env.CORS_CREDENTIALS !== 'false'
        },
        rateLimit: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
          max: parseInt(process.env.RATE_LIMIT_REQUESTS || '100', 10)
        }
      },
      
      database: {
        type: 'postgresql' as const,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'cisp_dev',
        username: process.env.DB_USERNAME || 'cisp_user',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10)
      },
      
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        database: parseInt(process.env.REDIS_DB || '0', 10),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'cisp:',
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10)
      },
      
      jwt: {
        secret: process.env.JWT_SECRET || '',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        issuer: process.env.JWT_ISSUER || 'CISP',
        algorithm: (process.env.JWT_ALGORITHM as any) || 'HS256'
      },
      
      logging: {
        level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
        enableFile: process.env.LOG_FILE_ENABLED !== 'false',
        enableConsole: process.env.LOG_CONSOLE_ENABLED !== 'false',
        logDir: process.env.LOG_FILE_PATH || './logs',
        maxFiles: process.env.LOG_MAX_FILES || '30d',
        maxSize: process.env.LOG_MAX_SIZE || '100MB'
      },
      
      file: {
        maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10),
        allowedMimeTypes: process.env.UPLOAD_ALLOWED_TYPES?.split(',') || undefined,
        uploadPath: process.env.UPLOAD_PATH || './uploads',
        tempPath: process.env.UPLOAD_TEMP_PATH || './temp'
      },
      
      email: {
        provider: (process.env.EMAIL_PROVIDER as any) || 'smtp',
        smtp: {
          host: process.env.MAIL_HOST || 'localhost',
          port: parseInt(process.env.MAIL_PORT || '587', 10),
          secure: process.env.MAIL_SECURE === 'true',
          auth: {
            user: process.env.MAIL_USERNAME,
            pass: process.env.MAIL_PASSWORD
          }
        }
      },
      
      security: {
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
        sessionSecret: process.env.SESSION_SECRET || '',
        csrfEnabled: process.env.CSRF_ENABLED !== 'false',
        helmetEnabled: process.env.HELMET_ENABLED !== 'false',
        httpsOnly: process.env.HTTPS_ONLY === 'true'
      },
      
      i18n: {
        defaultLanguage: process.env.DEFAULT_LANGUAGE || 'ko',
        supportedLanguages: process.env.SUPPORTED_LANGUAGES?.split(',') || ['ko', 'en'],
        fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'ko'
      },
      
      tenancy: {
        enabled: process.env.MULTI_TENANT_ENABLED !== 'false',
        defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default',
        rlsEnabled: process.env.RLS_ENABLED !== 'false'
      }
    };

    try {
      return ConfigSchema.parse(rawConfig);
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw new Error('Invalid configuration');
    }
  }

  /**
   * 설정 가져오기
   */
  public get(): Config {
    return this.config;
  }

  /**
   * 특정 설정 섹션 가져오기
   */
  public getSection<K extends keyof Config>(section: K): Config[K] {
    return this.config[section];
  }

  /**
   * 환경 확인
   */
  public isProduction(): boolean {
    return this.config.app.environment === Environment.PRODUCTION;
  }

  public isDevelopment(): boolean {
    return this.config.app.environment === Environment.DEVELOPMENT;
  }

  public isTest(): boolean {
    return this.config.app.environment === Environment.TEST;
  }

  /**
   * 설정 검증
   */
  public validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // JWT 시크릿 검증
    if (!this.config.jwt.secret || this.config.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }

    // 세션 시크릿 검증
    if (!this.config.security.sessionSecret || this.config.security.sessionSecret.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters long');
    }

    // 데이터베이스 비밀번호 검증
    if (!this.config.database.password) {
      errors.push('Database password is required');
    }

    // 프로덕션 환경 추가 검증
    if (this.isProduction()) {
      if (this.config.app.debug) {
        errors.push('Debug mode should be disabled in production');
      }
      
      if (!this.config.security.httpsOnly) {
        errors.push('HTTPS should be enforced in production');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * 전역 설정 인스턴스
 */
export const getConfig = (serviceName?: string): Config => {
  return ConfigManager.getInstance(serviceName).get();
};

/**
 * 설정 섹션 가져오기
 */
export const getConfigSection = <K extends keyof Config>(section: K, serviceName?: string): Config[K] => {
  return ConfigManager.getInstance(serviceName).getSection(section);
};

export default ConfigManager;