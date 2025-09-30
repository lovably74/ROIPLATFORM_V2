# ROIPLATFORM V2.0

멀티테넌트 MSA 기반의 건설 PMIS/EPMS/ERP 통합 플랫폼

## 🏗️ 아키텍처

### 개발환경 (Native 실행)
- **Gateway Service**: Node.js + Express (Port 3000)
- **Auth Service**: Java + Spring Boot (Port 3001)
- **Database**: PostgreSQL 17.4 (Port 5432)
- **Cache**: Redis/Memurai (Port 6379) - 추후 설정

### 운영환경 (Container 기반)
- Docker 컨테이너로 배포
- Kubernetes 오케스트레이션
- GitOps 기반 CI/CD

## 📋 사전 요구사항

### 설치된 도구
- ✅ PostgreSQL 17.4
- ✅ Java 21 (OpenJDK)
- ✅ Git 2.41.0
- ✅ Visual Studio Code
- ✅ Node.js 22.20.0 LTS (설치됨)

### 추가 설치 필요
- Redis/Memurai (캐시 서비스)
- Maven (Java 빌드 도구)

## 🚀 시작하기

### 1. 환경 설정 확인
```bash
# 개발환경 스크립트 실행
cd dev-environment
start-dev.bat
```

### 2. 서비스 실행

#### Gateway Service (Node.js)
```bash
cd services/gateway-service
npm install
npm run dev
```

#### Auth Service (Java Spring Boot)
```bash
cd services/auth-service
mvn spring-boot:run
```

### 3. 서비스 확인
- Gateway: http://localhost:3000/health
- Auth Service: http://localhost:3001/actuator/health  
- API Status: http://localhost:3000/api/v1/status
- Public Portal: http://localhost:3000/public
- Demo Project: http://localhost:3000/demo1234 (샘플 프로젝트)

## 📊 데이터베이스

### 연결 정보
- **Host**: localhost:5432
- **Database**: roiplatform
- **User**: roit
- **Encoding**: UTF-8 전체 지원
- **Schema**: 도메인 기반 멀티테넌트 스키마

### 테이블 구조 (19개 테이블)

#### 커테너테넌트 및 도메인 관리
- `users` - 전역 사용자
- `tenants` - 테넌트(기업/조직)
- `user_tenants` - 사용자-테넌트 관계 (프로젝트별 역할)
- `projects` - 프로젝트 (프로젝트 코드 포함)
- `project_domains` - 프로젝트 도메인 매핑 및 SSL 관리
- `project_settings` - 프로젝트별 설정 (JSON)
- `project_branding` - 로그인 페이지 브랜딩

#### 인증 및 보안
- `user_sessions` - 프로젝트별 세션 관리
- `oauth_providers` - 프로젝트별 SSO 설정
- `login_customizations` - 다국어 로그인 커스터마이징
- `login_attempts` - 로그인 시도 추적
- `security_policies` - 프로젝트별 보안 정책
- `project_access_logs` - 프로젝트 접근 로그

#### 과금 및 사용량
- `modules`, `price_books`, `subscriptions` - 과금 관련
- `usage_monthly`, `invoices` - 사용량 및 청구
- `audit_logs` - 감사 로그

## 🛠️ 개발 가이드

### 프로젝트 구조
```
ROIPLATFORM_V2/
├── services/                 # 마이크로서비스
│   ├── gateway-service/       # API Gateway (Node.js)
│   ├── auth-service/         # 인증서비스 (Java)
│   ├── tenant-service/       # 테넌트서비스 (Java)
│   └── ...
├── clients/                  # 클라이언트 앱
│   ├── web-client/           # React 웹앱
│   ├── desktop-client/       # Tauri 데스크톱
│   └── mobile-client/        # Ionic 모바일
├── shared/                   # 공통 리소스
│   ├── database/             # DB 스키마 & 마이그레이션
│   ├── common-libs/          # 공통 라이브러리
│   └── i18n/                # 다국어 리소스
└── dev-environment/          # 개발환경 설정
    └── local-config/         # 로컬 환경변수
```

### 개발 워크플로우
1. **독립 서비스 개발**: IDE에서 개별 서비스 개발 및 테스트
2. **통합 테스트**: 여러 서비스를 동시 실행하여 통합 테스트
3. **컨테이너 빌드**: 운영 배포를 위한 Docker 이미지 빌드

### 환경변수 설정
- `dev-environment/local-config/database.env` - DB 설정
- `dev-environment/local-config/cache.env` - 캐시 설정
- `dev-environment/local-config/common.env` - 공통 설정

## 🔐 인증 & 보안

### JWT 기반 인증
- Access Token: 24시간
- Refresh Token: 7일
- 멀티테넌트 컨텍스트 지원

### Row Level Security (RLS)
- PostgreSQL RLS 정책 활성화
- 테넌트별 데이터 격리
- API 레벨에서 추가 검증

## 📱 다국어 지원

### 기본 언어
- 한국어 (ko) - 기본값
- 영어 (en)
- 확장 가능한 JSON 기반 언어팩

### 핫스왑 지원
- 클라이언트에서 실시간 언어 전환
- 서버는 messageKey만 반환
- 클라이언트에서 i18n 렌더링

## 📈 개발 로드맵

### Now (0-3개월, MVP)
- ✅ 기본 인프라 구성
- ✅ 데이터베이스 스키마
- ✅ Gateway & Auth 서비스 기본 구조
- 🔄 PMIS-Collab 기본 기능

### Next (3-6개월)
- EPMS 일부 기능
- 소셜 로그인 연동
- 대시보드 & 리포트
- 다국어 이메일 템플릿

### Later (6-12개월)
- ERP 통합
- 고급 워크플로우
- 모바일 앱
- 고가용성 구성

## 🔧 트러블슈팅

### 일반적인 문제
1. **Node.js 명령어가 인식되지 않는 경우**
   - PowerShell 재시작 또는 시스템 재부팅
   - 환경변수 PATH 확인

2. **데이터베이스 연결 실패**
   - PostgreSQL 서비스 실행 상태 확인
   - 연결 정보 확인 (host, port, user, password)

3. **포트 충돌**
   - 다른 애플리케이션에서 포트 사용 중인지 확인
   - 필요시 환경변수에서 포트 번호 변경

## 📞 지원

개발 관련 문의나 이슈는 프로젝트 관리자에게 연락바랍니다.