# ROIPLATFORM — PRD v1.0 (멀티테넌시 단일 DB + 기능 단위 MSA)

## 0. 제품 개요·범위
- **제품명:** ROIPLATFORM 
- **목표:** PMIS·EPMS(설계/CM)·건설ERP·메신저를 **SaaS형 멀티테넌트**로 제공  
- **아키텍처:** **기능 단위 MSA**(모듈별 독립 배포) + **단일 DB(스키마 공유)** + **모든 테이블 `tenant_id` 보유**  
- **클라이언트:** 웹(멀티브라우저), 데스크톱(Tauri/Electron), 모바일(Capacitor)  
- **다국어:** ko/en 기본, JSON 언어팩 추가 시 즉시 반영(런타임 스위치)

---

## 1. 멀티테넌시 전략 (도메인 기반 + 단일 DB)

### 1.1) 도메인 기반 테넌시 모델
- **도메인 라우팅:** 사용자 도메인 → 프로젝트 코드 → 테넌트 식별  
- **메인 도메인:** `service.smartpmis.net` (시스템 전용, 사용자 사용 불가)  

#### 운영환경 접근 방식
- 사용자 도메인: `custom-domain.com` → `service.smartpmis.net/{project_code}`
- 직접 접근: `service.smartpmis.net/{project_code}`
- 기본 접근: `service.smartpmis.net` → `service.smartpmis.net/public`

#### 개발환경 접근 방식
- **localhost 기반:** `localhost:{port}/{project_code}` 형식 사용
- 예시: `localhost:3000/public`, `localhost:3000/demo1234`
- 기본 접근: `localhost:{port}` → `localhost:{port}/public` 자동 리다이렉트
- **오류 처리:** 존재하지 않는 프로젝트 코드 접근 시 오류 메시지 표시 후 `public`으로 리다이렉트

### 1.2) 프로젝트 코드 규칙
- **형식:** 영문자로 시작 + 영문/숫자 조합 (최소 4자 이상)
  - 유효 예시: `demo1234`, `acme2024`, `testproject`
  - 무효 예시: `123abc`, `한글프로젝트`, `pub`, `public`
- **예약어:** `public`, `admin`, `api`, `www`, `mail` 등 시스템 예약어 사용 불가
- **중복 검증:** 프로젝트 신청 시 실시간 중복 검사 필수
- **불변성:** 프로젝트 생성 후 코드 변경 불가 (데이터 일관성 보장)

### 1.3) 도메인 관리
- **1:N 관계:** 하나의 프로젝트에 여러 도메인 연결 가능
- **도메인 검증:** DNS 소유권 확인 (TXT 레코드 또는 파일 업로드)
- **SSL 인증서:** 자동 발급 및 갱신 (Let's Encrypt 연동)
- **제한 도메인:** `service.smartpmis.net`와 서브도메인은 사용자 등록 불가

### 1.4) 테넌트 식별 및 컨텍스트
- **식별 순서:** 도메인 → 프로젝트 코드 → 테넌트 ID → 사용자 컨텍스트
- **컨텍스트 전파:** Gateway에서 `X-Tenant-Id`, `X-Project-Code` 헤더 주입
- **세션 격리:** 프로젝트별 독립적인 세션 관리 (동시 접속 지원)

### 1.5) 데이터베이스 모델 확장
- 모든 테이블 **필수 컬럼:** `tenant_id UUID NOT NULL`  
- **FK 규칙:** FK 체인 최상단까지 `tenant_id` 일치 강제(컴포지트 FK 또는 RLS)  
- **인덱스 규칙:** (tenant_id, project_code, ...) 복합 인덱스 기본  
- **ID 정책:** 리소스 PK는 `UUID v4` (전역 유니크) + 업무 키는 `tenant_id` 범위 유니크

### 1.6) 격리·보안
- **Row-Level Security(RLS)** 정책 + 서비스 레이어에서 `WHERE tenant_id = :ctxTenant` 강제  
- **도메인 기반 CORS:** 등록된 도메인만 API 접근 허용
- **프로젝트별 격리:** 세션, 쿠키, 로컬스토리지 모두 프로젝트 단위로 분리
- 감사·접근 로그는 별도 파티션 테이블(월별) + `tenant_id` + `project_code` 포함

### 1.7) 스키마·파티셔닝
- 단일 스키마(`public`) 또는 기능 스키마(예: `pmis`, `epms`, `erp`) 중 택1  
- 대용량 테이블(문서버전, 로그, 지표)은 월별 파티셔닝 + `tenant_id` 서브 인덱스

---

## 2. 서비스 분할(기능 단위 MSA)
아래는 **“기능 단위 → 마이크로서비스”** 매핑입니다. 각 서비스는 자체 REST API와 이벤트를 가집니다.

### 2.1 공통·플랫폼
- **Gateway Service**: 인증 위임, 라우팅, RateLimit, 테넌트 컨텍스트 주입  
- **Auth/Identity Service**: 사용자/역할/RBAC·ABAC, SSO(OIDC: Google/Kakao/Naver/Facebook), MFA  
- **Tenant/Org Service**: 테넌트, 조직, 기업회원/개인회원 프로필  
- **I18N Service**: 언어팩 CRUD(ko/en/추가 JSON), 키 검증, 클라이언트 핫스와프 API  
- **Catalog & Pricing Service**: 모듈(기능) 정의, 단가 정책, 번들/프로모션  
- **Billing & Invoicing Service**: 사용량 집계(사용자 피크/스토리지 피크), 요금 계산, 인보이스/계산서  
- **Usage & Metering Service**: 사용자/스토리지/트래픽/문서 API 호출량 계측  
- **Notification Service**: 이메일/SMS/푸시/인앱 알림(다국어 템플릿)  
- **Search/Index Service**: 문서/업무/메시지 통합검색(권한·테넌트 필터)  
- **Audit/Log Service**: 접속/행위/보안 이벤트, 변경이력 WORM 보관  
- **File/DMS Core Service**: 파일 업/다운로드, 버전, 분류체계, 대용량 처리, AV스캔, 사전서명 URL  
- **Workflow/Approval Service**: 전자결재 양식, 라우팅, 결재선, 이력

### 2.2 PMIS 패키지
- **PMIS-Collab Service**: 공지, 일정, 자유게시판, 업무요청, 연락망, 조직도  
- **PMIS-Project Service**: 프로젝트 현황판/일정/위치/보고/기성·계약 요약(읽기 전용 집계)  
- **PMIS-DocLink Service**: 결재 데이터 검색·문서연계

### 2.3 EPMS 패키지 – 본사(설계)
- **EPMS-BD(Sales) Service**: 수주 영업정보(일일/월간/예상/관리표), 추진정보 등록/보고현황  
- **EPMS-ProjectHQ Service**: 프로젝트 기본/진행(품의, 수주비, 중단, 납품, 정산)  
- **EPMS-Budget Service**: 예산 기준/계획/변경/실행/추가/자금수지, 승인/변동 현황  
- **EPMS-MH & Attendance Service**: M/H 입력(일/주), 현황, 연차/휴가, 근태 신청/진행, 출결 수정, 양식 기반 신청  
- **EPMS-Cost Service**: 월 투입원가, 외주 공종 매핑, 진행률 외주비, M/H 집계, 경비·원가 현황, 외주비 지급, 청구/수금, 마감  
- **EPMS-Settlement Service**: 배부 기준(공통비/면적/옵션), 개인·프로젝트 배부, 손익/일반관리비 배부, 정산 후 예산명세  
- **EPMS-Master Service**: 코드, 회사, 사원, 조견표, 예산기준, 로그/공통, 전자결재 연계  
- **EPMS-Monitor Service**: 대시보드, 손익, 인력운용, 사업계획/KPI 업로드

### 2.4 EPMS 패키지 – 본사(CM)
- **EPMS-CM-Biz Service**: 사업기회(입찰/공모), PQ(진행·배치), 입찰현황/패찰분석, 계약/매출계획  
- **EPMS-CM-HR Service**: 경력·현황, 가동, 휴가, 근태, 출퇴근부, 등급/직급 단가  
- **EPMS-CM-Project Service**: 착수(계약별 현황/실행계획/외주), 실행(배치/MH/조정 승인/보고)  
- **EPMS-CM-CostAR Service**: 비용처리, 외주비 지급품의, 전도금/수당관리  
- **EPMS-CM-PL(Profit&Loss) Service**: 매출·원가·손익 코드/방식/집계/분석/반영, 기성/입금·미수  
- **EPMS-CM-Monitor Service**: Forecast 대비 실행/수주/진행/인력 가동  
- **EPMS-CM-Master/Report/DMS Service**: 발주사/관계사/분류체계, 표준 템플릿, 웹문서, 권한, DMS(분류/보관/검색)

### 2.5 건설ERP 패키지(1차 범위)
- **ERP-GL & AR/AP Service**: 계정과목, 전표, 결산, 자금일보, 미수/미지급, 프로젝트 손익 매핑  
- **ERP-Costing Service**: 표준/실적 원가, 간접비 배부, 공종/WBS 연계  
- **ERP-Procurement & Inventory Service**: 발주/검수/입출고/재고, 자재승인·검수 연동  
- **ERP-HR & Payroll Service**: 인사카드, 직급/등급 단가, 근태/휴가, 급여 산정, 프로젝트 배부  
- **ERP-Integration Service**: EPMS/PMIS와 원가/기성/계약/결재 데이터 싱크

### 2.6 메신저
- **Messenger Service**: 조직/프로젝트 룸, 1:1/그룹, 파일공유, 멘션/스레드, 읽음표시, 푸시, 보존정책

---

## 3. API 원칙·계약
- **공통 헤더:** `Authorization: Bearer`, `X-Tenant-Id`, `Accept-Language`  
- **표준 규격:** REST/JSON, `/api/v1/...` 버전 고정, Cursor 기반 페이지네이션  
- **Idempotency:** 생성/청구/결재 등은 `Idempotency-Key` 요구  
- **오류 규격:** `{ code, messageKey, params, traceId }` (클라이언트가 messageKey를 i18n으로 표시)  
- **권한 모델:** 토큰 클레임에 `tenant_id`, `roles`, `scopes` 포함(RBAC+리소스 소유권)  
- **웹훅/이벤트:** 주요 상태(프로젝트 개설, 결재 승인, 인보이스 발행 등) → `Integration Service` 전파

---

## 4. 다국어(i18n) 요구
- **리소스:** `/i18n/<locale>/*.json` (도메인별: auth, nav, pmis, epms, erp, billing, common…)  
- **핫스와프:** 클라이언트 상태에서 locale 교체 시 즉시 반영(페이지 리로드 없음)  
- **서버 메시지:** 서버는 `messageKey`만 반환, 클라이언트 i18n에서 텍스트 렌더  
- **운영:** 누락 키 검출 CI, 용어집(Glossary), 번역 승인 워크플로우

---

## 5. 과금·정책
- **단위 요소:** 모듈(기능)별 기본가, 사용자당 기본가, 스토리지 GB당 기본가  
- **월 과금:** 월 최대 사용자 수/스토리지 사용량 기준 (피크 기반)  
- **연 과금:** 월 × 12 × (1 - 10%) 자동 할인  
- **정책 관리:** 카탈로그에서 관리자가 수정(모듈 등록/단가/번들/프로모션)  
- **인보이스:** 월말 자동 산출 → 이메일 통보(PDF 첨부, 다국어 템플릿)  
- **회계 연동(옵션):** 전자세금계산서, 외부 회계 시스템 컨넥터

---

## 6. 도메인 기반 인증 및 커스터마이징

### 6.1) 인증 라우팅 전략
- **도메인 인증 처리:**
  - 비로그인 상태에서 모든 요청은 로그인 페이지로 리다이렉트
  - `service.smartpmis.net` 접속 → `service.smartpmis.net/public/login` (공용 로그인)
  - `service.smartpmis.net/{project_code}` 접속 → 해당 프로젝트 로그인 페이지
  - 사용자 도메인 접속 → 해당 프로젝트 로그인 페이지

### 6.2) 공용 로그인 (`public`)
- **대상 사용자:** 개인회원 전용 (기업회원 접근 불가)
- **제공 기능:** 기본 로그인, 회원가입, 비밀번호 재설정
- **디자인:** 시스템 기본 디자인 (ROIPLATFORM 브랜딩)
- **다국어:** ko/en 기본 지원
- **SSO 연동:** Google, Kakao, Naver, Facebook 기본 제공

### 6.3) 프로젝트별 커스텀 로그인
- **커스터마이징 요소:**
  - 로고 이미지 (PNG, JPG, SVG 지원, 최대 2MB)
  - 캐치프레이즈 (최대 100자)
  - 배경 이미지 (로그인 페이지 배경, 최대 5MB)
  - 브랜드 커러 (Primary, Secondary, Accent 커러)
  - 폰트 설정 (시스템 기본 폰트 또는 웹폰트)
- **SSO 연동 선택:**
  - 각 프로젝트마다 사용할 SSO 제공자 선택 가능
  - 제공자별 독립적인 Client ID/Secret 설정
  - SAML, OIDC 커스텀 연동 지원
- **다국어 지원:**
  - 기본 언어 설정 (ko, en, ja, zh 등)
  - 커스텀 다국어 팩 업로드 가능
  - 로그인 페이지 라벨 커스터마이징
- **인코딩 지원:**
  - 모든 입력/출력 및 저장은 UTF-8 인코딩 사용
  - 다국어 문자 전체 지원
  - 프론트엔드/백엔드/DB 추가 인코딩 변환 없이 일관된 UTF-8 사용

### 6.4) 세션 및 쿠키 관리
- **격리 원칙:**
  - 프로젝트별 독립적인 세션 저장소
  - 쿠키 Path에 프로젝트 코드 포함 (`/{project_code}`)
  - 동일 브라우저에서 여러 프로젝트 동시 로그인 지원
- **JWT 토큰 관리:**
  - 프로젝트별 독립적인 JWT 시크릿
  - 토큰에 `project_code`, `tenant_id` 클레임 포함
  - 리프레시 토큰도 프로젝트별 관리

### 6.5) 보안 정책
- **로그인 시도 제한:**
  - 프로젝트 코드별 5회 이상 로그인 실패 시 public으로 강제 리다이렉트
  - IP 기반 실패 시도 기록
  - 로그인 시도 실패 상태는 5분 동안 유지
- **입력 검증:**
  - 모든 사용자 입력은 서버측 검증 필수
  - SQL Injection, XSS 방지를 위한 필터링
  - 입력 데이터 유효성 검사
- **로깅 및 모니터링:**
  - 모든 인증 시도 로그 기록
  - 프로젝트별 접근 및 인증 상태 모니터링

### 6.5) 대시보드 및 초기 화면
- **로그인 후 라우팅:**
  - 대시보드 사용 설정 ON: 대시보드 페이지로 이동
  - 대시보드 사용 설정 OFF: 첫 번째 메뉴 페이지로 이동
  - 메뉴 없을 경우: 사용자 프로필 페이지로 이동
- **대시보드 커스터마이징:**
  - 위젪f 레이아웃 설정 (KPI, 차트, 테이블, 링크 등)
  - 데이터 소스 연결 (PMIS, EPMS, ERP 모듈 데이터)
  - 사용자 그룹별 대시보드 템플릿

### 6.6) 프로젝트 설정 관리
- **설정 가능 항목:**
  - 기본 정보 (프로젝트명, 설명, 업종)
  - 로그인 페이지 커스터마이징
  - 대시보드 사용 여부 및 레이아웃
  - 도메인 및 SSL 인증서 관리
  - SSO 제공자 설정
  - 다국어 및 지역 설정
  - 알림 및 이메일 템플릿
- **권한 관리:**
  - `PROJECT_OWNER`: 모든 설정 변경 가능
  - `PROJECT_ADMIN`: 사용자 및 기능 설정 변경 가능
  - `PROJECT_MANAGER`: 일부 운영 설정 변경 가능

## 7. 초기 화면·역할 (수정)
- **개인회원 홈 (`public`):** 건설뉴스 피드, 프로젝트 참여 현황, To-Do, 최근 문서/결재, 알림  
- **기업회원 홈 (프로젝트별):** 구성 가능한 위젯 대시보드(KPI, 인력/원가, 기성/수금, 일정 등)  
- **운영자 분리:** Provider Console(요금/운영/번역/시스템) vs Project Console(도메인/사용자/설정) vs Tenant Console(조직/구독)

---

## 8. 데이터 모델 (핵심 테이블 규칙/예시)

### 8.1) 공통 컬럼 및 규칙
- **공통 컬럼:** `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at NULL`  
- **ID 정책:** UUID v4 사용, 전역 유니크 보장
- **인덱스 규칙:** `(tenant_id, project_code, ...)` 복합 인덱스 기본
- **문자열 인코딩:** 모든 문자열 데이터는 UTF-8 인코딩 사용
- **스키마 문자집합:** `UTF8` 문자집합을 기본으로 사용
- **사용자 입력 저장:** 무조건 UTF-8 변환하여 저장

### 8.2) 사용자 및 테넌트 관리
- **users**(id, **global_login_id UNIQUE**, email UNIQUE, phone, name, preferred_lang, password_hash, …)  
- **user_tenants**(user_id, tenant_id, project_code, roles[])  ← 기업회원/개인회원 멀티 소속 + 프로젝트별 역할
- **tenants**(id, name, display_name, business_type, status, …)

### 8.3) 프로젝트 및 도메인 관리
- **projects**(id, tenant_id, **project_code UNIQUE**, name, status, template_id, dashboard_enabled, …)  
  - `project_code`: 영문자 시작 + 영문/숫자 4자 이상, 전역 유니크
  - `dashboard_enabled`: 대시보드 사용 여부 (boolean)
- **project_domains**(id, project_code, domain_name, **is_primary**, ssl_cert_status, verification_status, …)
  - 하나의 프로젝트에 여러 도메인 연결 가능
  - `is_primary`: 기본 도메인 여부 (redirect 대상)
- **project_settings**(project_code, setting_key, setting_value, setting_type, …)
  - 프로젝트별 커스텀 설정 (JSON 형태)
- **project_branding**(project_code, logo_url, background_url, primary_color, catchphrase, font_family, …)
  - 로그인 페이지 커스터마이징 정보

### 8.4) 인증 및 세션 관리
- **user_sessions**(id, user_id, project_code, session_token, jwt_token, expires_at, ip_address, user_agent, …)
  - 프로젝트별 독립적인 세션 관리
- **oauth_providers**(id, project_code, provider_name, client_id, client_secret, enabled, config_json, …)
  - 프로젝트별 SSO 제공자 설정
- **login_customizations**(project_code, locale, login_labels_json, welcome_message, terms_url, …)
  - 프로젝트별 로그인 페이지 다국어 커스터마이징

### 8.5) 기존 테이블 (수정)
- **modules**(id, code UNIQUE, i18n_key, billable, category, …)  
- **price_books**(tenant_id, module_id, base_price, price_per_user, price_per_gb, currency, effective_at, …)  
- **subscriptions**(id, tenant_id, project_code, cycle{MONTHLY|YEARLY}, start_at, status, …)  
- **usage_monthly**(tenant_id, project_code, yyyymm, users_peak, storage_peak_gb, api_calls, …)  
- **invoices**(id, tenant_id, project_code, period, amount, status, pdf_url, …)  
- **dms_documents**(id, tenant_id, project_code, project_id, path, meta_json, acl_json, version, checksum, …)  
- **approval_routes**(id, tenant_id, project_code, form_id, route_json, …)  
- **audit_logs**(id, tenant_id, project_code, actor_id, action, target, payload, at, …, partition by month)

### 8.6) 예약어 및 제약 사항
- **예약어 목록:** `public`, `admin`, `api`, `www`, `mail`, `ftp`, `cdn`, `static`, `assets`
- **프로젝트 코드 검증:** 정규식 `^[a-zA-Z][a-zA-Z0-9]{3,}$`
- **도메인 제한:** `*.smartpmis.net` 전체 및 `service.smartpmis.net` 사용자 등록 불가
- **로그인 실패 제한:** 각 프로젝트 코드마다 5회 실패 시 public으로 강제 이동
- **개발환경 접근:** localhost 기반 접근 시 project_code 유효성 검사
- **인코딩 제한:** 모든 테이블/필드는 UTF-8 지원 필수

> **유니크 키 가이드**  
> - **전역 유니크:** `users.global_login_id`, `modules.code`, `projects.project_code`
> - **테넌트 범위 유니크:** `(tenant_id, name)`, `(tenant_id, project_code, ...)`
> - **프로젝트 범위 유니크:** `(project_code, domain_name)`, `(project_code, user_id)`

---

## 8. 수용 기준(샘플)
- **다국어 전환:** 헤더 언어 드롭다운 변경 시 UI 텍스트 100% 즉시 전환(리로드 없음)  
- **테넌시 격리:** RLS 활성화 상태에서 타 테넌트 레코드 접근 불가(쿼리·API·검색 결과)  
- **최초 관리자:** `admin/1234` 최초 로그인 시 비밀번호 변경 강제(미변경 시 기능 제한)  
- **과금 검증:** 해당 월 `users_peak`/`storage_peak_gb`가 인보이스 금액과 일치  
- **소셜 로그인:** Google/Kakao/Naver/Facebook 프로필 매핑·중복 병합 플로우 정상

---

## 9. 이벤트(비동기) – 예시 토픽
- `tenant.created`, `user.invited`, `project.created`, `project.template.applied`  
- `approval.completed`, `invoice.generated`, `payment.settled`  
- `dms.document.versioned`, `dms.document.approved`  
- `erp.voucher.posted`, `epms.budget.approved`, `epms.mh.submitted`

---

## 10. 개발 및 운영 환경 분리 전략

### 10.1 개발환경 (Native 실행)

- **아키텍처:** 동일한 기능 단위 MSA 구조를 유지하되, 각 서비스를 네이티브 프로세스로 실행
- **구성 방식:**
  - Java 서비스: IDE 또는 직접 JAR 실행 (Spring Boot)
  - Node.js 서비스: npm/yarn 스크립트로 직접 실행
  - 데이터베이스: 로컬 PostgreSQL 인스턴스(단일 DB, 멀티테넌트 스키마 유지)
  - 캐시: 로컬 Redis/Memurai 인스턴스
  - 메시지 브로커: 로컬 RabbitMQ/Kafka 인스턴스
- **개발 장점:**
  - 빠른 시작/재시작 시간으로 개발 생산성 향상
  - 직접적인 디버깅 지원 (브레이크포인트, 핫스왑 등)
  - IDE 통합 기능 완전 활용
  - 파일 시스템 직접 접근으로 설정 관리 용이
  - 서비스별 독립 개발 및 테스트 가능

### 10.2 통합 테스트 환경

- **하이브리드 접근:** 필요한 서비스만 Docker로 실행하고 개발 중인 서비스는 네이티브 실행
- **구성 요소:** 
  - Docker Compose 기반 필수 인프라(데이터베이스, 메시지 브로커, 캐시 등)
  - 필요시 Docker 네트워크에 로컬 서비스 연결
  - 공유 테스트 환경으로 활용 가능

### 10.3 운영환경 (컨테이너 기반)

- **아키텍처:** 모든 서비스를 Docker 컨테이너로 배포
- **컨테이너화 전략:**
  - 각 마이크로서비스를 독립 Docker 이미지로 빌드
  - Docker Compose 또는 Kubernetes로 오케스트레이션
  - GitOps(ArgoCD) 기반 자동화된 배포 파이프라인
- **운영 장점:**
  - 환경 일관성 보장
  - 수평적 확장 용이
  - 롤백 및 버전 관리 간소화
  - 자원 사용량 모니터링 및 최적화
  - 보안 통제 강화

### 10.4 기술 스택 매트릭스

#### 개발환경 기술 스택
- **백엔드:**
  - Java 21 + Spring Boot 3.x (모든 마이크로서비스 - Auth, Tenant, PMIS, EPMS, ERP Services)
  - Spring Cloud Gateway (API Gateway)
  - Spring Security + JWT (인증 및 권한 관리)
  - Spring Data JPA + QueryDSL (데이터베이스 접근)
- **프론트엔드:**
  - Vue 3.4+ + TypeScript (웹 클라이언트 - Composition API 기반)
  - Vite 5.x (빌드 도구 및 개발 서버)
  - Pinia (상태 관리)
  - Vue Router 4.x (라우팅)
  - Nuxt 3.x (SSR/SSG - 선택적)
  - Tauri (데스크톱 클라이언트)
  - Ionic Vue + Capacitor (모바일 클라이언트)
- **데이터베이스:**
  - PostgreSQL 15+ (Primary Database, 로컬 설치)
  - Redis/Memurai (Caching & Session, Windows 네이티브)
- **메시지 큐:**
  - RabbitMQ 또는 Apache Kafka (이벤트 스트리밍, 로컬 설치)
- **개발 도구:**
  - IntelliJ IDEA / VSCode (IDE)
  - Postman / Insomnia (API 테스트)
  - Git (버전 관리)
  - Maven/Gradle (Java 빌드), npm/yarn (Node.js 빌드)

#### 운영환경 기술 스택
- **컨테이너 기술:**
  - Docker 24+ (컨테이너화)
  - Docker Compose (로컬/개발 오케스트레이션)
  - Kubernetes 1.28+ (운영 오케스트레이션)
- **인프라:**
  - AWS/Azure/GCP (클라우드 인프라)
  - ArgoCD (GitOps 배포)
  - Terraform (IaC)
- **모니터링 & 로깅:**
  - Prometheus + Grafana (메트릭)
  - ELK Stack (로깅)
  - Jaeger (분산 트레이싱)
- **보안:**
  - HashiCorp Vault (시크릿 관리)
  - cert-manager (TLS 인증서)
  - OPA/Gatekeeper (정책 관리)

---

## 11. 개발환경 설정 가이드

### 11.1 Windows 개발환경 요구사항

- **사전 설치 필요:**
  - Node.js 20+ LTS (API Gateway, 프론트엔드 빌드)
  - OpenJDK 21 (Java 서비스)
  - PostgreSQL 15+ (Primary DB)
  - Memurai Developer (Redis 호환 Windows 버전)
  - Git (2.40+)
  - Visual Studio Code 또는 IntelliJ IDEA

### 11.2 개발환경 디렉토리 구조

```
ROIPLATFORM_V2/
├── backend/
│   ├── roiplatform-gateway/      # Spring Cloud Gateway
│   ├── roiplatform-auth/         # Spring Boot + Security
│   ├── roiplatform-tenant/       # Spring Boot
│   ├── roiplatform-i18n/         # Spring Boot
│   ├── roiplatform-pmis/         # Spring Boot
│   ├── roiplatform-epms/         # Spring Boot
│   ├── roiplatform-erp/          # Spring Boot
│   ├── roiplatform-billing/      # Spring Boot
│   ├── roiplatform-notification/ # Spring Boot
│   ├── roiplatform-dms/          # Spring Boot
│   └── roiplatform-common/       # 공통 라이브러리
├── frontend/
│   ├── web-app/                  # Vue 3 + TypeScript
│   ├── desktop-app/              # Tauri + Vue 3
│   └── mobile-app/               # Ionic Vue + Capacitor
├── shared/
│   ├── database/
│   │   ├── migrations/               # DB 스키마 마이그레이션
│   │   └── seeds/                    # 초기 데이터
│   ├── common-libs/              # 공통 라이브러리
│   └── i18n/                     # 다국어 리소스
├── docker/                       # 운영 배포용 Docker 설정
│   ├── docker-compose.prod.yml
│   └── k8s/
├── docs/                         # 문서
├── scripts/                      # 빌드 및 배포 스크립트
└── dev-environment/
    ├── docker-compose.dev.yml     # 개발용 인프라 (선택적)
    ├── local-config/             # 각 서비스 로컬 설정
    └── start-dev.sh              # 전체 개발환경 시작 스크립트
```

### 11.3 개발 워크플로우

1. **독립 서비스 개발:**
   - IDE에서 개별 서비스 프로젝트 오픈
   - 개발 중인 서뺄비스만 로컬에서 실행
   - 다른 서비스는 stub/mock 또는 이전 버전 사용

2. **통합 개발 및 테스트:**
   - PostgreSQL, Redis 로컬 인스턴스 시작
   - 여러 서비스를 동시에 실행하여 통합 테스트
   - API 간 통신 및 데이터 동기화 확인

3. **빌드 및 배포 준비:**
   - Docker 이미지 빌드 테스트
   - CI/CD 파이프라인으로 자동 배포

---

## 12. NFR·운영
- **성능:** p95 < 300ms(핵심 API) / 대용량 업로드 스트리밍  
- **가용성:** 99.9%, RPO ≤ 1h, RTO ≤ 4h(초기)  
- **보안:** TLS1.2+, at-rest 암호화, Vault로 키/시크릿 관리, SAST/DAST, SBOM  
- **관측성:** 분산 트레이싱 + 구조화 로그 + 메트릭(테넌트 태그)  
- **릴리즈:** GitOps(ArgoCD), 카나리/블루그린  
- **브라우저:** 최신 2대 버전, 접근성 ARIA  
- **규정맵핑:** ISMS/ISO27001/27017/27018/GDPR/KISA/HIPAA/PCI DSS 스코프 정의 및 증빙 로그

---

## 13. KISA 및 국가 구준사항

### 13.1) KISA 보안 가이드라인 준수

#### 소프트웨어 개발 보안 가이드 준수
- **입력 데이터 검증 및 표현:**
  - SQL 인젝션 방지: 매개변수화 쿼리, 입력값 요소별 검증
  - XSS 방지: 출력값 인코딩, 입력값 필터링
  - 업로드 파일 검증: 파일 타입/크기 제한, 앙티바이러스 스캔
- **보안 기능:**
  - 인증 및 권한관리: 다단계 인증, 세션 관리, 역할 기반 접근제어
  - 중요데이터 보호: 개인정보 암호화, 마스킹 및 암호화 키 관리
  - 기계적 보안: 비밀번호 정책, 계정 잠금, 로그인 시도 제한
- **세션 통제:**
  - 세션 타임아웃, 동시 접속 제한, 세션 고정 방지
  - 중요 기능에 대한 재인증 요구

#### 소프트웨어 보안약점 진단가이드 준수
- **코드 보안 점검:**
  - OWASP Top 10 취약점 점검 및 대응
  - 정적 보안 카 카다이스
  - 동적 보안 카네브 TESTING
- **보안 카 카다스 주기:**
  - 개발 및 빌드 단계에서 SAST/DAST 자동 수행
  - 코드 리뷰 시 보안 체크리스트 활용
  - 주기적 취약점 스캔 수행

#### 모바일 전자정부서비스 앱 소스코드 검증 가이드라인 준수
- **모바일 보안:**
  - 액세스 및 데이터 예브:
  - 앱 서명 및 무결성 검증
  - 디바이스 기반 인증 지원 (Biometrics, PIN)
  - 암호화된 데이터 저장 및 전송
- **앱 보안 기능:**
  - 루팅/디버깅 탐지 및 방어
  - 코드 난독화 및 앞전 재패키웕
  - 실시간 위협 탐지 (Runtime Application Self-Protection)

#### 제로트러스트 가이드라인 2.0 준수
- **신룰 검증 범위:**
  - 모든 사용자, 디바이스, 애플리케이션에 대한 보안 검증
  - 어떤 사용자도 네트워크에 신뢰하지 않음 (Never Trust, Always Verify)
- **지속적 검증:**
  - 모든 접근 요청에 대한 실시간 위험 점수 평가
  - 동적 접근 제어 및 최소 권한 원칙
  - 이상 행위 탐지 및 자동 대응
- **마이크로 세그먼테이션:**
  - API 레벨에서의 보안 경계 설정
  - 서비스 간 통신 암호화 (mTLS)
  - 각 마이크로서비스별 독립적 보안 정책

### 13.2) 웹 접근성 지침 준수

#### 한국형 웹 컨텐츠 접근성 지침 2.2 (KWCAG 2.2) 준수
- **인식의 용이성 (Perceivable):**
  - 대체 텍스트: 모든 이미지, 버튼, 입력 요소에 적절한 alt 속성 제공
  - 자막 및 음성 설명: 동영상 컨텐츠에 자막 및 음성 가이드 제공
  - 색상 대비: 텍스트와 배경 간 충분한 대비비 (AA레벨: 4.5:1, AAA레벨: 7:1)
  - 크기 조절 가능: 200%까지 확대 시에도 컨텐츠 손실 없음
- **운용의 용이성 (Operable):**
  - 키보드 접근성: 모든 기능을 키보드로 사용 가능
  - 충분한 시간 제공: 시간 제한이 있는 컨텐츠에 조절/연장 기능
  - 발작 예방: 번웩이는 컨텐츠 제한 (1초에 3회 이하)
  - 탐색 도움: 페이지 내비게이션, 빵크름타다, 사이트맵 제공
- **이해의 용이성 (Understandable):**
  - 언어 표시: HTML lang 속성으로 페이지 언어 명시
  - 사용자 입력 도움: 입력 오류 시 명확한 안내 메시지
  - 라벨과 설명: 모든 입력 요소에 적절한 라벨 제공
- **강건성 (Robust):**
  - 마크업 유효성: 웹 표준에 따른 유효한 HTML/CSS/JS 사용
  - 보조 기술 지원: 스크린 리더 등 보조 기술과 호환

### 13.3) 준수 및 검증 방안

#### 개발 단계별 준수 활동
- **설계 단계:**
  - Secure by Design 원칙 적용
  - 위협 모델링 (Threat Modeling) 수행
  - 보안 및 접근성 요구사항 정의
- **개발 단계:**
  - 보안 코딩 가이드라인 준수
  - 정적 코드 분석 도구 (SAST) 활용
  - 접근성 자동 테스트 수행
- **테스트 단계:**
  - 동적 애플리케이션 보안 테스트 (DAST)
  - 관통 테스트 (Penetration Testing)
  - 접근성 전문가 검증
- **운영 단계:**
  - 지속적 보안 모니터링
  - 주기적 취약점 스캔
  - 사용자 접근성 피드백 수집 및 개선

#### 준수 상태 모니터링
- **보안 대시보드:**
  - KISA 보안 체크리스트 준수 현황
  - 취약점 발견 및 해결 진행률
  - 보안 사고 및 대응 내역
- **접근성 모니터링:**
  - KWCAG 2.2 지침 준수률 대시보드
  - 사용자별 접근성 사용 현황 추적
  - 접근성 개선 요청 및 처리 내역

### 13.4) 준수 증빙 및 감사 대응
- **인증/인증 준비:**
  - ISMS-P 인증 준비 (개인정보 보호 및 정보보안 관리체계)
  - 공공 기관 전자정부 보안 인증 및 검사 대응
  - 웹 접근성 품질마크 인증 및 인증 준비
- **보안 감사 대응:**
  - 취약점 진단 결과 보고서 제공
  - 보안 사고 대응 체계 및 절차 수립
  - 정기적 보안 교육 및 인식 제고
- **접근성 감사 대응:**
  - 웹 접근성 진단 보고서 및 개선 계획
  - 장애인 사용자 피드백 수집 및 대응 체계
  - 접근성 전문 인력 확보 및 역량 강화

---

## 14. 개발 로드맵 (Now / Next / Later)
- **Now (0–3개월, MVP)**  
  - 개발환경: Gateway, Auth/Identity(SSO 1~2개), Tenant/Org, I18N, DMS Core(업/다운/버전), PMIS-Collab(공지/일정/업무요청), Project 템플릿 v1
  - 운영인프라: 개발용 CI/CD 파이프라인, 컨테이너 이미지 빌드 자동화, 단일 환경 배포
  - 공통: Usage 수집(사용자·스토리지), Catalog&Pricing 스켈레톤, Invoicing(수동 결제), Notification(이메일), 감사로그 기본
- **Next (3–6개월)**  
  - 개발환경: EPMS-BD/ProjectHQ/Budget/MH 일부, PMIS-Project 보드, 개발/테스트 환경 분리
  - 운영인프라: 멀티 스테이지 배포, 블루/그린 배포 전략, 모니터링 구축
  - 공통: Billing 자동화(게이트웨이 연동), 소셜 로그인 4종, 대시보드/리포트, 다국어 이메일/푸시 템플릿
- **Later (6–12개월)**  
  - 개발환경: EPMS-Cost/Settlement/CM 전반, ERP(회계·원가·구매·인사급여 1차), 공정(WBS Gantt/S-curve)
  - 운영인프라: Kubernetes 기반 오케스트레이션, 자동 스케일링, DR 구성
  - 공통: 전자세금계산서·회계 연동, 분산 트레이싱 고도화, API 게이트웨이 고가용성 구성

---

## 15. 화면·UX 가이드 (요약)
- 전역: 언어 선택, 테넌트 스위처, 통합 검색, 알림  
- 개인 홈 vs 기업 홈 **차등 레이아웃** (기업 홈은 위젯 커스터마이즈)  
- 문서/결재/프로젝트 중심의 **빠른 접근 패널**  
- 데이터 그리드: 모든 리스트는 `tenant_id` 컨텍스트 하에 필터/정렬/엑스포트

---

## 16. 대표 API 예시

### 15.1) 도메인 및 프로젝트 관리
- **프로젝트 코드 중복 검사:**  
  `GET /api/v1/projects/check-code?code=demo1234`  
  `{ "available": true, "suggestions": ["demo1235", "demo2024"] }`
- **프로젝트 생성(커스터마이징 포함):**  
  `POST /api/v1/projects { projectCode, name, templateId, modules[], branding: { logo, primaryColor, ... } }`  
  → 비동기 이벤트 `project.created`, `project.template.applied`
- **도메인 등록 및 검증:**  
  `POST /api/v1/projects/{projectCode}/domains { domainName, isPrimary }`  
  `POST /api/v1/projects/{projectCode}/domains/{domainId}/verify` → DNS/파일 검증
- **SSL 인증서 자동 발급:**  
  `POST /api/v1/projects/{projectCode}/domains/{domainId}/ssl/issue`

### 15.2) 인증 및 세션 관리
- **도메인 기반 인증 정보 확인:**  
  `GET /api/v1/auth/resolve?domain=custom-domain.com`  
  `{ "projectCode": "demo1234", "tenantId": "uuid", "loginUrl": "/login", "branding": {...} }`
- **프로젝트별 로그인:**  
  `POST /api/v1/auth/{projectCode}/login { username, password }`  
  `POST /api/v1/auth/{projectCode}/sso/google { token }`
- **다중 세션 관리:**  
  `GET /api/v1/auth/sessions` → 동시 로그인된 모든 프로젝트 목록  
  `POST /api/v1/auth/sessions/{projectCode}/switch` → 프로젝트 전환

### 15.3) 커스터마이징 및 설정
- **로그인 페이지 커스터마이징:**  
  `PUT /api/v1/projects/{projectCode}/branding { logo, background, colors, fonts, ... }`
- **SSO 제공자 설정:**  
  `POST /api/v1/projects/{projectCode}/oauth-providers { provider, clientId, clientSecret, config }`
- **다국어 커스터마이징:**  
  `PUT /api/v1/projects/{projectCode}/i18n/{locale} { loginLabels, welcomeMessage, ... }`
- **대시보드 설정:**  
  `PUT /api/v1/projects/{projectCode}/dashboard { enabled, layout, widgets[] }`

### 15.4) 기존 API (수정)
- **모듈 과금 카탈로그 등록:**  
  `POST /api/v1/catalog/modules { code, nameKey, billable, basePrice }`
- **월 사용량 확정:**  
  `POST /api/v1/usage/close?period=YYYY-MM&projectCode=demo1234` → `invoice.generated` 발생
- **다국어 키 조회:**  
  `GET /api/v1/i18n?locale=en&projectCode=demo1234&domain=pmis`

---

## 17. 권한 모델(요약)
- **Provider(서비스 운영자):** `PROVIDER_ADMIN`, `PROVIDER_OPERATOR`  
- **Tenant(기업):** `TENANT_OWNER`, `TENANT_ADMIN`, `POWER_USER`, `MEMBER`, `GUEST`  
- **프로젝트 레벨:** 모듈별 권한(보기/작성/승인/관리) 오버레이

---

## 18. 데이터 이행·마이그레이션
- 초기 템플릿(메뉴/권한/문서분류/결재양식) → **Seed 데이터**로 제공  
- 외부 ERP/문서 이관: Import 파이프라인 + 검증 리포트(테넌트 스코프)

---

## 19. 테스트 계획(하이라이트)
- **개발환경 테스트:**
  - **단위/통합 테스트:** 각 서비스 독립 실행 환경에서 단위 및 통합 테스트 수행
  - **API 계약 테스트:** 서비스 간 API 계약 준수 검증 (Consumer-Driven Contracts)
  - **로컬 E2E:** 단일 개발자 머신에서의 전체 흐름 테스트
- **운영환경 테스트:**
  - **RLS/E2E:** 타 테넌트 데이터 접근 차단 확인(직접 SQL 시나리오 포함)
  - **컨테이너 통합 테스트:** 컨테이너화된 서비스 간 통신 및 상호작용 검증
  - **인프라 검증:** 컨테이너 오케스트레이션, 네트워크 정책, 리소스 할당 검증
- **공통 테스트:**
  - **과금 시뮬레이터:** `users_peak`/`storage_peak_gb` 케이스 기반 요금 검증
  - **i18n 회귀:** 누락 키/플레이스홀더 미스매치 자동 검출
  - **성능:** 문서 업로드/검색/결재 승인 플로우에 대한 p95/throughput 스모크

---

### 부록 A. 모듈→서비스 매핑 Quick 표 (발췌)
- 수주영업(일일/월간/예상/보고) → **EPMS-BD**  
- 프로젝트 기본/진행(품의/수주비/중단/납품/정산) → **EPMS-ProjectHQ**  
- 예산(기준/계획/변경/실행/추가/자금수지/승인현황) → **EPMS-Budget**  
- M/H·연차·근태·신청서 → **EPMS-MH & Attendance**  
- 원가/외주/청구·수금/마감 → **EPMS-Cost**  
- 배부·손익·일반관리비 → **EPMS-Settlement**  
- CM의 사업기회/PQ/입찰/계약 → **EPMS-CM-Biz**  
- CM 인력·가동·근태·단가 → **EPMS-CM-HR**  
- CM 착수/실행/MH/보고·비용·기성/입금 → **EPMS-CM-Project / CM-CostAR / CM-PL**  
- PMIS(공지/일정/업무요청/현황/전자결재연계) → **PMIS-Collab / PMIS-Project / Workflow**  
- ERP(회계/원가/구매/자재/HR·급여) → **ERP-GL & AR/AP / ERP-Costing / ERP-Proc&Inv / ERP-HR&Payroll**  
- 과금/정책/인보이스/사용량 → **Catalog & Pricing / Billing & Invoicing / Usage & Metering**
