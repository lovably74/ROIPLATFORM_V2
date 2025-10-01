# CISP 마이크로서비스 프로젝트 구조

## 전체 디렉토리 구조

```
ROIPLATFORM_V2/
├── services/                      # 마이크로서비스들
│   ├── gateway/                   # API Gateway Service
│   ├── auth/                      # Auth/Identity Service
│   ├── tenant/                    # Tenant/Org Service
│   ├── i18n/                      # I18N Service
│   ├── notification/              # Notification Service
│   ├── file-dms/                  # File/DMS Core Service
│   ├── workflow/                  # Workflow/Approval Service
│   ├── pmis-collab/              # PMIS-Collab Service
│   ├── pmis-project/             # PMIS-Project Service
│   ├── usage-metering/           # Usage & Metering Service
│   └── billing/                   # Billing & Invoicing Service
├── shared/                        # 공통 라이브러리 및 설정
│   ├── common-libs/               # 공통 라이브러리
│   │   ├── core/                  # 핵심 공통 기능
│   │   ├── database/              # 데이터베이스 공통 기능
│   │   ├── security/              # 보안 공통 기능
│   │   └── utils/                 # 유틸리티 함수들
│   ├── schemas/                   # 공통 스키마 정의
│   ├── types/                     # 공통 타입 정의
│   └── config/                    # 공통 설정 파일
├── frontend/                      # 프론트엔드 애플리케이션
│   ├── web/                       # 웹 애플리케이션 (React/Next.js)
│   ├── desktop/                   # 데스크톱 애플리케이션 (Tauri)
│   └── mobile/                    # 모바일 애플리케이션 (Capacitor)
├── database/                      # 데이터베이스 관련
│   ├── migrations/                # DB 마이그레이션 파일
│   ├── seeds/                     # 초기 데이터
│   ├── schemas/                   # 스키마 정의
│   └── scripts/                   # DB 유틸리티 스크립트
├── infrastructure/                # 인프라스트럭처 코드
│   ├── docker/                    # Docker 설정
│   ├── kubernetes/                # K8s 매니페스트
│   ├── terraform/                 # Infrastructure as Code
│   └── monitoring/                # 모니터링 설정
├── docs/                          # 프로젝트 문서
├── scripts/                       # 개발/배포 스크립트
├── .github/                       # GitHub Actions
└── docker-compose.yml            # 로컬 개발용
```

## 개별 서비스 구조 (예: auth 서비스)

```
services/auth/
├── src/                           # 소스 코드
│   ├── controllers/               # REST API 컨트롤러
│   ├── services/                  # 비즈니스 로직
│   ├── repositories/              # 데이터 액세스 레이어
│   ├── models/                    # 도메인 모델
│   ├── middlewares/               # 미들웨어
│   ├── validators/                # 입력 검증
│   ├── events/                    # 이벤트 핸들러
│   └── utils/                     # 서비스별 유틸리티
├── tests/                         # 테스트 파일
│   ├── unit/                      # 단위 테스트
│   ├── integration/               # 통합 테스트
│   └── fixtures/                  # 테스트 데이터
├── migrations/                    # 서비스별 마이그레이션
├── config/                        # 서비스별 설정
├── docs/                          # 서비스 문서
├── package.json                   # Node.js 의존성
├── tsconfig.json                  # TypeScript 설정
├── Dockerfile                     # 컨테이너 설정
└── README.md                      # 서비스 설명
```

## 공통 라이브러리 구조

```
shared/common-libs/
├── core/                          # 핵심 공통 기능
│   ├── base-controller.ts         # 기본 컨트롤러
│   ├── base-service.ts            # 기본 서비스
│   ├── base-repository.ts         # 기본 리포지토리
│   ├── error-handler.ts           # 에러 핸들링
│   └── response-formatter.ts      # 응답 포맷터
├── database/                      # 데이터베이스 공통
│   ├── connection.ts              # DB 연결 관리
│   ├── query-builder.ts           # 쿼리 빌더
│   ├── transaction.ts             # 트랜잭션 관리
│   ├── tenant-filter.ts           # 테넌트 필터링
│   └── rls-manager.ts             # RLS 관리
├── security/                      # 보안 공통
│   ├── jwt.ts                     # JWT 처리
│   ├── encryption.ts              # 암호화
│   ├── tenant-context.ts          # 테넌트 컨텍스트
│   └── permissions.ts             # 권한 관리
├── utils/                         # 유틸리티
│   ├── logger.ts                  # 로깅
│   ├── validator.ts               # 검증
│   ├── uuid.ts                    # UUID v7 생성
│   └── i18n.ts                    # 다국어 지원
└── types/                         # 공통 타입 정의
    ├── auth.types.ts              # 인증 관련 타입
    ├── tenant.types.ts            # 테넌트 관련 타입
    └── common.types.ts            # 기타 공통 타입
```

## 기술 스택별 구성

### Backend Services (Node.js + TypeScript)
- **Framework**: Express.js + TypeORM
- **Database**: PostgreSQL (with RLS)
- **Cache**: Redis
- **Message Queue**: Redis Pub/Sub (later: RabbitMQ)
- **Authentication**: JWT + Passport.js
- **Validation**: Joi
- **Testing**: Jest + Supertest

### Frontend Applications
- **Web**: Next.js + TypeScript + Tailwind CSS
- **Desktop**: Tauri + Rust + Next.js
- **Mobile**: Capacitor + Next.js

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Orchestration**: Kubernetes (production)
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack (Elasticsearch + Logstash + Kibana)
- **CI/CD**: GitHub Actions

## 환경별 구성

### Development
- Docker Compose로 모든 서비스 로컬 실행
- Hot reload 지원
- 통합 로깅 및 디버깅

### Staging
- Kubernetes 클러스터
- Production과 동일한 구성
- 테스트 데이터 사용

### Production
- Kubernetes 클러스터
- 고가용성 구성
- 모니터링 및 알림 설정