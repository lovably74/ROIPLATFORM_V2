# Gateway Service 설계 문서

## 개요
CISP 플랫폼의 API Gateway 서비스로, 모든 클라이언트 요청의 단일 진입점 역할을 합니다.

## 핵심 기능 정의

### 1. 라우팅 규칙
**질문**: 어떤 라우팅 규칙을 적용할 것인가?

**답변**:
- **서비스별 라우팅**: `/api/v1/{service-name}/*` 형태
  - `/api/v1/auth/*` → Auth Service (포트: 3001)
  - `/api/v1/tenant/*` → Tenant Service (포트: 3002)
  - `/api/v1/i18n/*` → I18N Service (포트: 3003)
  - `/api/v1/files/*` → File-DMS Service (포트: 3004)
  - `/api/v1/pmis/*` → PMIS-Collab Service (포트: 3005)

- **프로젝트 코드 기반 라우팅**: `/{project-code}/*`
  - `/demo1234/dashboard` → Frontend with project context
  - `/public/*` → 공용 페이지

- **우선순위**: API 라우팅 > 프로젝트 라우팅 > 기본 라우팅

### 2. 인증 방식
**질문**: 어떤 인증 방식을 지원할 것인가?

**답변**:
- **JWT Bearer Token**: API 인증용
- **세션 쿠키**: 웹 브라우저용
- **API Key**: 서비스 간 통신용
- **SSO Token**: 소셜 로그인용

### 3. 테넌트 컨텍스트 주입
**질문**: 테넌트 컨텍스트를 어떻게 주입할 것인가?

**답변**:
- **헤더 주입**:
  - `X-Tenant-Id`: UUID 형태의 테넌트 식별자
  - `X-Project-Code`: 프로젝트 코드
  - `X-User-Id`: 현재 사용자 ID
  - `X-Request-Id`: 요청 추적용 UUID

- **소스 우선순위**:
  1. 명시적 헤더 (`X-Tenant-Id`)
  2. JWT 클레임 (`tenantId`)
  3. URL 경로 (`/{project-code}`)
  4. 기본값 (`default`)

### 4. 미들웨어 구성
**질문**: 어떤 미들웨어를 구성할 것인가?

**답변**:
```
Request Flow:
1. CORS 미들웨어
2. 보안 헤더 (Helmet)
3. Rate Limiting
4. 요청 로깅
5. 테넌트 컨텍스트 추출
6. 인증 검증
7. 권한 확인
8. 프록시 라우팅
9. 에러 핸들링
10. 응답 로깅
```

### 5. 로드 밸런싱
**질문**: 서비스 인스턴스간 로드 밸런싱을 어떻게 할 것인가?

**답변**:
- **라운드 로빈**: 기본 전략
- **가중 라운드 로빈**: 서버 성능에 따른 가중치
- **헬스 체크**: 비정상 인스턴스 제외
- **Circuit Breaker**: 장애 전파 방지

### 6. 에러 핸들링
**질문**: 에러를 어떻게 처리하고 응답할 것인가?

**답변**:
- **표준 에러 형식**: 
```json
{
  "code": "GATEWAY_ERROR",
  "messageKey": "errors.gateway.service_unavailable",
  "message": "Service temporarily unavailable",
  "traceId": "req-uuid",
  "timestamp": "2025-10-01T09:13:42Z"
}
```

- **에러 코드 체계**:
  - `GATEWAY_*`: Gateway 자체 에러
  - `AUTH_*`: 인증 관련 에러
  - `TENANT_*`: 테넌트 관련 에러
  - `SERVICE_*`: 백엔드 서비스 에러

### 7. 성능 최적화
**질문**: 성능 최적화를 어떻게 할 것인가?

**답변**:
- **연결 풀링**: 서비스간 HTTP 연결 재사용
- **응답 캐싱**: 정적 리소스 및 API 응답 캐시
- **압축**: gzip/brotli 응답 압축
- **Keep-Alive**: HTTP 연결 유지
- **리소스 제한**: 메모리/CPU 사용량 모니터링

## 서비스 등록 테이블

| 서비스명 | 포트 | 경로 | 상태 |
|----------|------|------|------|
| gateway | 3000 | `/` | 활성 |
| auth | 3001 | `/api/v1/auth` | 활성 |
| tenant | 3002 | `/api/v1/tenant` | 활성 |
| i18n | 3003 | `/api/v1/i18n` | 계획 |
| file-dms | 3004 | `/api/v1/files` | 계획 |
| pmis-collab | 3005 | `/api/v1/pmis` | 계획 |

## 보안 요구사항

### 1. 입력 검증
- 모든 입력값 검증
- SQL Injection 방지
- XSS 방지
- Path Traversal 방지

### 2. 레이트 리밋
- IP별 요청 제한: 100req/15min
- 사용자별 요청 제한: 1000req/hour
- 서비스별 요청 제한: 10000req/min

### 3. 보안 헤더
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`

## 모니터링 메트릭

### 1. 기본 메트릭
- 요청 처리량 (RPS)
- 응답 시간 (P50, P95, P99)
- 에러율 (%)
- 서비스별 상태

### 2. 비즈니스 메트릭
- 테넌트별 요청 분포
- API 엔드포인트별 사용량
- 인증 성공/실패율
- 캐시 히트율

## 설정 가능 항목

### 환경변수
```env
# 서버 설정
GATEWAY_PORT=3000
GATEWAY_HOST=0.0.0.0

# 서비스 디스커버리
SERVICE_REGISTRY_TYPE=static
AUTH_SERVICE_URL=http://localhost:3001
TENANT_SERVICE_URL=http://localhost:3002

# 보안 설정
JWT_SECRET=your-secret-key
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# 캐시 설정
REDIS_URL=redis://localhost:6379
CACHE_TTL=300

# 로깅 설정
LOG_LEVEL=info
LOG_REQUESTS=true
```