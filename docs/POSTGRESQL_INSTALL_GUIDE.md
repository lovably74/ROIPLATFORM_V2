# PostgreSQL 설치 가이드 (Windows)

## 1. PostgreSQL 다운로드

1. **공식 사이트 방문**: https://www.postgresql.org/download/windows/
2. **직접 다운로드**: https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64.exe

## 2. PostgreSQL 설치

### 설치 실행
1. 다운로드한 `postgresql-16.6-1-windows-x64.exe` 파일을 관리자 권한으로 실행
2. 설치 위치: `C:\Program Files\PostgreSQL\16` (기본값 사용 권장)

### 설치 설정값
다음 설정으로 진행하세요:

- **Port**: `5432` (기본값)
- **Superuser password**: `admin123!` (개발용 - 실제 환경에서는 강력한 패스워드 사용)
- **Locale**: `Korean, South Korea` 또는 `C` (기본값)

### 설치 구성요소
다음 구성요소들을 모두 설치하세요:
- [x] PostgreSQL Server
- [x] pgAdmin 4
- [x] Stack Builder (선택사항)
- [x] Command Line Tools

## 3. 환경변수 설정

설치 후 다음 환경변수를 설정해야 합니다:

### PowerShell에서 환경변수 추가:
```powershell
# 시스템 PATH에 PostgreSQL bin 경로 추가
$env:PATH += ";C:\Program Files\PostgreSQL\16\bin"

# 영구적으로 PATH 설정 (관리자 권한 필요)
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\Program Files\PostgreSQL\16\bin", "Machine")
```

## 4. 설치 확인

설치가 완료되면 다음 명령어로 확인:

```powershell
# PostgreSQL 버전 확인
psql --version

# PostgreSQL 서비스 상태 확인
Get-Service -Name "*postgres*"

# 데이터베이스 연결 테스트
psql -U postgres -h localhost -p 5432
```

## 5. CISP 프로젝트용 데이터베이스 생성

PostgreSQL 설치 후 CISP 프로젝트용 데이터베이스와 사용자를 생성해야 합니다:

```sql
-- 관리자(postgres)로 접속 후 실행
CREATE DATABASE cisp_dev;
CREATE DATABASE cisp_test;

-- 개발용 사용자 생성
CREATE USER cisp_user WITH PASSWORD 'cisp_password123!';

-- 권한 부여
GRANT ALL PRIVILEGES ON DATABASE cisp_dev TO cisp_user;
GRANT ALL PRIVILEGES ON DATABASE cisp_test TO cisp_user;

-- 스키마 권한 부여
\c cisp_dev
GRANT ALL PRIVILEGES ON SCHEMA public TO cisp_user;
\c cisp_test
GRANT ALL PRIVILEGES ON SCHEMA public TO cisp_user;
```

## 6. 연결 정보

설치 완료 후 프로젝트에서 사용할 연결 정보:

```
Host: localhost
Port: 5432
Database: cisp_dev (개발용)
Username: cisp_user
Password: cisp_password123!
```

## 트러블슈팅

### 포트 충돌 오류
```powershell
# 5432 포트 사용 확인
netstat -ano | findstr :5432
```

### 서비스 수동 시작
```powershell
# PostgreSQL 서비스 시작
Start-Service -Name "postgresql*"
```

### 방화벽 설정
Windows Defender 방화벽에서 PostgreSQL 허용 필요할 수 있음.