import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

// Common libraries
import { 
  initializeLogger, 
  getConfig,
  createTenantContextMiddleware 
} from '@cisp/common-libs';

// Local imports
import { setupMiddlewares } from './middlewares';
import { setupRoutes } from './routes';
import { ServiceRegistry } from './services/ServiceRegistry';
import { HealthChecker } from './services/HealthChecker';
import { MetricsCollector } from './services/MetricsCollector';

class GatewayServer {
  private app: Application;
  private config: any;
  private logger: any;
  private serviceRegistry: ServiceRegistry;
  private healthChecker: HealthChecker;
  private metricsCollector: MetricsCollector;
  private redisClient: any;

  constructor() {
    this.app = express();
    this.config = getConfig('gateway');
    this.logger = initializeLogger('gateway');
    
    this.serviceRegistry = new ServiceRegistry();
    this.healthChecker = new HealthChecker();
    this.metricsCollector = new MetricsCollector();
  }

  /**
   * 서버 초기화
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Gateway 서버 초기화 중...', {
        service: 'gateway',
        version: this.config.app.version,
        environment: this.config.app.environment
      });

      // Redis 클라이언트 초기화
      await this.setupRedis();

      // 기본 미들웨어 설정
      await this.setupBasicMiddlewares();

      // 커스텀 미들웨어 설정
      await this.setupCustomMiddlewares();

      // 라우트 설정
      await this.setupRoutes();

      // 에러 핸들러 설정
      this.setupErrorHandlers();

      this.logger.info('Gateway 서버 초기화 완료');
    } catch (error) {
      this.logger.error('Gateway 서버 초기화 실패', error);
      throw error;
    }
  }

  /**
   * Redis 설정
   */
  private async setupRedis(): Promise<void> {
    try {
      this.redisClient = createClient({
        url: `redis://${this.config.redis.host}:${this.config.redis.port}`,
        password: this.config.redis.password,
        database: this.config.redis.database
      });

      this.redisClient.on('error', (err: Error) => {
        this.logger.error('Redis 연결 오류', err);
      });

      this.redisClient.on('connect', () => {
        this.logger.info('Redis 연결 성공');
      });

      await this.redisClient.connect();
    } catch (error) {
      this.logger.error('Redis 설정 실패', error);
      throw error;
    }
  }

  /**
   * 기본 미들웨어 설정
   */
  private async setupBasicMiddlewares(): Promise<void> {
    // 보안 헤더
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }));

    // CORS
    this.app.use(cors({
      origin: this.config.server.cors.origin,
      credentials: this.config.server.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With', 
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Tenant-Id',
        'X-Project-Code',
        'X-Request-Id'
      ]
    }));

    // 압축
    this.app.use(compression());

    // JSON 파싱
    this.app.use(express.json({
      limit: '10mb'
    }));

    // URL 인코딩
    this.app.use(express.urlencoded({
      extended: true,
      limit: '10mb'
    }));

    // 세션 설정
    const sessionStore = new RedisStore({
      client: this.redisClient,
      prefix: 'cisp:session:'
    });

    this.app.use(session({
      store: sessionStore,
      secret: this.config.security.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: this.config.security.httpsOnly,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24시간
        sameSite: 'lax'
      }
    }));

    this.logger.info('기본 미들웨어 설정 완료');
  }

  /**
   * 커스텀 미들웨어 설정
   */
  private async setupCustomMiddlewares(): Promise<void> {
    // 요청 추적 ID 생성
    this.app.use((req: any, res: any, next: any) => {
      req.requestId = req.headers['x-request-id'] || this.generateRequestId();
      res.setHeader('X-Request-Id', req.requestId);
      next();
    });

    // 테넌트 컨텍스트 미들웨어
    this.app.use(createTenantContextMiddleware());

    // 커스텀 미들웨어들 설정
    setupMiddlewares(this.app, {
      redis: this.redisClient,
      config: this.config,
      logger: this.logger,
      serviceRegistry: this.serviceRegistry,
      metricsCollector: this.metricsCollector
    });

    this.logger.info('커스텀 미들웨어 설정 완료');
  }

  /**
   * 라우트 설정
   */
  private async setupRoutes(): Promise<void> {
    // 헬스체크 엔드포인트
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'gateway',
        version: this.config?.app?.version || '1.0.0'
      });
    });

    // 상세 헬스체크 엔드포인트
    this.app.get('/health/detailed', async (_req: Request, res: Response) => {
      try {
        const healthStatus = await this.healthChecker.checkAll();
        res.json(healthStatus);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed'
        });
      }
    });

    // 메트릭 엔드포인트
    this.app.get('/metrics', (_req: Request, res: Response) => {
      const metrics = this.metricsCollector.getMetrics();
      res.json(metrics);
    });

    // API 라우트 설정
    setupRoutes(this.app, {
      serviceRegistry: this.serviceRegistry,
      config: this.config,
      logger: this.logger
    });

    this.logger.info('라우트 설정 완료');
  }

  /**
   * 에러 핸들러 설정
   */
  private setupErrorHandlers(): void {
    // 404 핸들러
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        code: 'GATEWAY_NOT_FOUND',
        messageKey: 'errors.gateway.not_found',
        message: 'Endpoint not found',
        path: req.path,
        method: req.method,
        traceId: (req as any).requestId,
        timestamp: new Date().toISOString()
      });
    });

    // 글로벌 에러 핸들러
    this.app.use((error: any, req: any, res: any, _next: any) => {
      const statusCode = error.statusCode || error.status || 500;
      
      this.logger.error('Gateway 에러 발생', error, {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        statusCode
      });

      res.status(statusCode).json({
        code: error.code || 'GATEWAY_ERROR',
        messageKey: error.messageKey || 'errors.gateway.internal_error',
        message: error.message || 'Internal server error',
        traceId: req.requestId,
        timestamp: new Date().toISOString()
      });
    });

    this.logger.info('에러 핸들러 설정 완료');
  }

  /**
   * 서버 시작
   */
  public async start(): Promise<void> {
    const port = this.config.server.port;
    const host = this.config.server.host;

    await this.initialize();

    this.app.listen(port, host, () => {
      this.logger.info(`Gateway 서버가 시작되었습니다`, {
        port,
        host,
        environment: this.config.app.environment,
        processId: process.pid
      });
    });

    // 프로세스 종료 시 정리 작업
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  /**
   * 우아한 종료
   */
  private async gracefulShutdown(): Promise<void> {
    this.logger.info('Gateway 서버 종료 중...');
    
    try {
      // Redis 연결 종료
      if (this.redisClient) {
        await this.redisClient.disconnect();
      }

      this.logger.info('Gateway 서버가 정상적으로 종료되었습니다');
      process.exit(0);
    } catch (error) {
      this.logger.error('서버 종료 중 오류 발생', error);
      process.exit(1);
    }
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Express 앱 인스턴스 반환 (테스트용)
   */
  public getApp(): Application {
    return this.app;
  }
}

// 서버 시작
if (require.main === module) {
  const server = new GatewayServer();
  server.start().catch((error) => {
    console.error('서버 시작 실패:', error);
    process.exit(1);
  });
}

export default GatewayServer;