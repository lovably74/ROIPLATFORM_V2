# ROIPLATFORM V2 - Windows 개발환경 설정 가이드

> **중요**: PRD에 따라 개발환경에서는 Docker를 사용하지 않습니다.  
> 모든 서비스는 **Native Process**로 직접 실행합니다.

## 📋 사전 요구사항

### 필수 소프트웨어 설치

#### 1. Node.js 20+ LTS
```powershell
# Node.js 공식 사이트에서 다운로드
# https://nodejs.org/ko/download/

# 설치 확인
node --version  # v20.x.x 이상
npm --version   # 10.x.x 이상
```

#### 2. OpenJDK 21
```powershell
# Microsoft Build of OpenJDK 설치 권장
# https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-21

# 환경 변수 설정
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.x.x"
$env:PATH += ";$env:JAVA_HOME\bin"

# 설치 확인
java --version   # openjdk 21.x.x
javac --version  # javac 21.x.x
```

#### 3. PostgreSQL 15+
```powershell
# PostgreSQL 공식 인스톨러 사용
# https://www.postgresql.org/download/windows/

# 설치 시 설정:
# - 포트: 5432 (기본값)
# - 사용자명: postgres
# - 비밀번호: 개발용으로 간단하게 설정
# - 데이터베이스: roiplatform_db 생성

# psql로 연결 확인
psql -U postgres -h localhost -p 5432
```

#### 4. Memurai Developer (Redis 호환)
```powershell
# Memurai Developer Edition 설치 (Windows용 Redis 호환)
# https://www.memurai.com/get-memurai

# 또는 Redis를 WSL에서 실행
wsl --install
# WSL Ubuntu에서: sudo apt install redis-server

# 연결 확인
redis-cli ping  # PONG 응답 확인
```

#### 5. 개발 도구
```powershell
# Git 설치
# https://git-scm.com/download/win

# IDE 선택 (둘 중 하나)
# IntelliJ IDEA Community/Ultimate
# https://www.jetbrains.com/idea/

# Visual Studio Code
# https://code.visualstudio.com/
```

## 🏗️ 프로젝트 구조 및 실행 방법

### 디렉토리 구조
```
ROIPLATFORM_V2/
├── backend/                      # Spring Boot 마이크로서비스
│   ├── roiplatform-gateway/      # Spring Cloud Gateway (Port: 8080)
│   ├── roiplatform-auth/         # 인증 서비스 (Port: 8081)
│   ├── roiplatform-tenant/       # 테넌트 서비스 (Port: 8082)
│   ├── roiplatform-pmis/         # PMIS 서비스 (Port: 8083)
│   ├── roiplatform-epms/         # EPMS 서비스 (Port: 8084)
│   └── roiplatform-erp/          # ERP 서비스 (Port: 8085)
├── frontend/                     # Vue 3 클라이언트
│   ├── web-app/                  # Vue 3 웹앱 (Port: 3000)
│   ├── desktop-app/              # Tauri 데스크톱앱
│   └── mobile-app/               # Ionic 모바일앱
├── shared/                       # 공통 리소스
│   ├── database/migrations/      # DB 마이그레이션 스크립트
│   └── i18n/                     # 다국어 리소스
└── scripts/                      # 개발 스크립트
    ├── start-all-services.ps1    # 전체 서비스 시작
    ├── stop-all-services.ps1     # 전체 서비스 중지
    └── setup-dev-db.ps1          # 개발 DB 초기화
```

## 🚀 개발 환경 실행

### 1단계: 데이터베이스 초기화

```powershell
# PostgreSQL 데이터베이스 생성
psql -U postgres -h localhost -c "CREATE DATABASE roiplatform_db;"
psql -U postgres -h localhost -c "CREATE USER roiplatform WITH PASSWORD 'roiplatform123!';"
psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE roiplatform_db TO roiplatform;"

# 스키마 마이그레이션 (초기 스크립트 실행)
psql -U roiplatform -d roiplatform_db -f shared/database/migrations/01-init-schema.sql
psql -U roiplatform -d roiplatform_db -f shared/database/migrations/02-seed-data.sql
```

### 2단계: 환경 변수 설정

```powershell
# .env.example을 .env.local로 복사
Copy-Item .env.example .env.local

# .env.local 파일을 편집하여 개발환경 설정 변경
# 주요 설정들:
# DATABASE_HOST=localhost
# DATABASE_PORT=5432
# DATABASE_NAME=roiplatform_db
# DATABASE_USERNAME=roiplatform
# DATABASE_PASSWORD=roiplatform123!
# REDIS_HOST=localhost
# REDIS_PORT=6379
```

### 3단계: 백엔드 서비스 실행

#### 방법 1: 개별 서비스 실행 (개발 권장)
```powershell
# Gateway 서비스 실행
cd backend/roiplatform-gateway
.\mvnw spring-boot:run

# 새 터미널에서 Auth 서비스 실행  
cd backend/roiplatform-auth
.\mvnw spring-boot:run

# 필요한 서비스들을 각각 새 터미널에서 실행...
```

#### 방법 2: 스크립트로 전체 실행
```powershell
# PowerShell 스크립트 실행 권한 설정
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 전체 백엔드 서비스 시작
.\scripts\start-all-services.ps1

# 서비스 중지
.\scripts\stop-all-services.ps1
```

### 4단계: 프론트엔드 실행

```powershell
# Vue 3 웹 애플리케이션 실행
cd frontend/web-app

# 의존성 설치 (최초 1회)
npm install

# 개발 서버 시작
npm run dev

# 브라우저에서 http://localhost:3000 접속
```

## 🛠️ 개발 워크플로우

### IDE 설정

#### IntelliJ IDEA 설정
1. **Open Project** → `ROIPLATFORM_V2` 폴더 선택
2. **JDK 21** 설정 확인
3. **Maven** 자동 import 활성화
4. **Spring Boot** 플러그인 설치
5. **Run Configuration** 각 서비스별로 생성:
   - Main class: `com.roiplatform.gateway.GatewayApplication`
   - Program arguments: `--spring.profiles.active=dev`
   - Environment variables: `.env.local` 파일 내용 참조

#### VS Code 설정
1. **Extensions 설치**:
   - Java Extension Pack
   - Spring Boot Extension Pack
   - Vue Language Features (Volar)
   - WindiCSS IntelliSense
   - GitLens

2. **Workspace 설정** (`.vscode/settings.json`):
```json
{
  "java.jdt.ls.vmargs": "-XX:+UseParallelGC -XX:GCTimeRatio=4 -XX:AdaptiveSizePolicyWeight=90 -Dsun.zip.disableMemoryMapping=true -Xmx2G -Xms100m",
  "java.configuration.runtimes": [
    {
      "name": "JavaSE-21",
      "path": "C:/Program Files/Microsoft/jdk-21.x.x"
    }
  ],
  "vue.server.hybridMode": true,
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### 개발 시 주의사항

#### 1. 포트 충돌 방지
```powershell
# 사용 중인 포트 확인
netstat -an | findstr :8080
netstat -an | findstr :3000

# 포트 사용 중인 프로세스 종료 (필요시)
taskkill /F /PID [PID번호]
```

#### 2. 서비스 의존성 순서
```
1. PostgreSQL, Redis 먼저 실행
2. Gateway 서비스 실행 (8080)
3. Auth 서비스 실행 (8081) 
4. 기타 마이크로서비스들 실행
5. Vue 프론트엔드 실행 (3000)
```

#### 3. 환경별 프로파일
```powershell
# 개발 환경
--spring.profiles.active=dev

# 로컬 테스트 환경  
--spring.profiles.active=local

# 통합 테스트 환경
--spring.profiles.active=integration
```

## 🔍 디버깅 및 모니터링

### 애플리케이션 상태 확인
```powershell
# Spring Boot Actuator Health Check
curl http://localhost:8080/actuator/health
curl http://localhost:8081/actuator/health

# Vue 개발 서버 상태
curl http://localhost:3000
```

### 로그 확인
```powershell
# Spring Boot 로그는 각 서비스 터미널에서 실시간 확인
# 로그 레벨: application-dev.yml에서 설정

# Vue 개발 로그는 브라우저 개발자 도구에서 확인
```

### 데이터베이스 연결 테스트
```sql
-- psql로 직접 연결하여 테스트
psql -U roiplatform -d roiplatform_db

-- 테이블 목록 확인
\dt

-- 샘플 쿼리
SELECT * FROM tenants LIMIT 5;
```

## 📚 추가 리소스

### API 문서
- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI JSON: http://localhost:8080/v3/api-docs

### 개발 도구
- pgAdmin: PostgreSQL GUI 도구
- Redis Desktop Manager: Redis GUI 도구  
- Postman: API 테스팅 도구

### 성능 모니터링
- Spring Boot Admin: 각 서비스 모니터링
- Vue DevTools: Vue 애플리케이션 디버깅

## ⚠️ 문제 해결

### 자주 발생하는 문제들

#### 1. Java 버전 문제
```powershell
# JAVA_HOME 확인
echo $env:JAVA_HOME

# PATH에서 Java 경로 확인
java -version
where java
```

#### 2. 포트 사용 중 오류
```powershell
# 특정 포트 사용 중인 프로세스 확인
netstat -ano | findstr :8080

# 프로세스 강제 종료
taskkill /F /PID [프로세스ID]
```

#### 3. 데이터베이스 연결 오류
```powershell
# PostgreSQL 서비스 상태 확인
Get-Service postgresql*

# PostgreSQL 재시작
Restart-Service postgresql-x64-15
```

#### 4. Redis 연결 문제
```powershell
# Memurai 서비스 확인
Get-Service memurai*

# Redis CLI 연결 테스트
redis-cli ping
```

---

## 🎯 다음 단계

1. **개발 환경 구축 완료 후**: 각 서비스별 개발 시작
2. **API 개발**: OpenAPI 스펙 기반 API 구현
3. **프론트엔드 컴포넌트**: Vue 3 + WindiCSS 컴포넌트 개발
4. **통합 테스트**: 서비스 간 통신 테스트
5. **CI/CD 파이프라인**: GitHub Actions 등을 통한 자동화

---
**문서 버전**: v1.0  
**최종 업데이트**: 2024-09-30  
**작성자**: ROIPLATFORM 개발팀