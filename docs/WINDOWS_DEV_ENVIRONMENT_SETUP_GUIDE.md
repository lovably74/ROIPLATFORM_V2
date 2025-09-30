# Windows 개발환경 표준 설정 가이드

> **작성일**: 2025-09-30  
> **대상**: Windows 11 기반 개발환경  
> **용도**: 모든 신규 프로젝트 개발환경 표준 구성  

## 📋 목차

1. [개요](#개요)
2. [필수 구성 요소](#필수-구성-요소)
3. [상세 설치 가이드](#상세-설치-가이드)
4. [환경변수 설정](#환경변수-설정)
5. [검증 방법](#검증-방법)
6. [자동화 스크립트](#자동화-스크립트)
7. [트러블슈팅](#트러블슈팅)
8. [추가 권장사항](#추가-권장사항)

## 🎯 개요

이 문서는 Windows 기반에서 Java/Spring Boot, React/Node.js 풀스택 개발을 위한 표준 개발환경 구성 가이드입니다. Docker를 사용하지 않고 네이티브 Windows 환경에서 모든 서비스를 실행하는 방식을 채택합니다.

### 핵심 설계 원칙
- **네이티브 실행**: Docker 없이 Windows 네이티브 환경에서 직접 실행
- **표준화**: 모든 프로젝트에서 일관된 환경 구성
- **자동화**: 반복 가능한 설치 프로세스
- **검증 가능**: 각 구성 요소의 정상 작동 확인

## 🛠 필수 구성 요소

| 구성 요소 | 버전 | 용도 | 설치 방법 |
|----------|------|------|----------|
| **Java** | OpenJDK 21 LTS | 백엔드 런타임 | Microsoft Build |
| **Maven** | 3.9.11+ | 빌드 도구 | Chocolatey |
| **Node.js** | 22.x LTS | 프론트엔드 런타임 | 공식 인스톨러 |
| **PostgreSQL** | 17.x | 메인 데이터베이스 | 공식 인스톨러 |
| **Redis** | 5.0.14+ | 캐싱/세션 저장소 | Windows 포트 |
| **Git** | 2.41+ | 버전 관리 | 공식 인스톨러 |
| **PowerShell** | 5.1+ | 스크립팅 환경 | Windows 기본 |

## 📦 상세 설치 가이드

### 1. Java 21 (OpenJDK) 설치

```powershell
# Chocolatey를 통한 설치 (권장)
choco install openjdk21 -y

# 또는 Microsoft Build 직접 다운로드
# https://docs.microsoft.com/en-us/java/openjdk/download#openjdk-21
```

**설치 후 확인:**
```powershell
java -version
javac -version
```

**예상 출력:**
```
openjdk version "21.0.4" 2024-07-16 LTS
OpenJDK Runtime Environment Microsoft-9889606 (build 21.0.4+7-LTS)
```

### 2. Maven 설치

```powershell
# Chocolatey를 통한 설치
choco install maven -y
```

**설치 후 확인:**
```powershell
mvn -version
```

### 3. Node.js 설치

#### 공식 인스톨러 방법 (권장)
1. https://nodejs.org/en/download/ 에서 LTS 버전 다운로드
2. `.msi` 파일 실행하여 설치
3. 설치 시 "Add to PATH" 옵션 체크 확인

#### Chocolatey 방법
```powershell
choco install nodejs -y
```

**설치 후 확인:**
```powershell
node --version
npm --version
```

### 4. PostgreSQL 설치

#### 공식 인스톨러 방법 (권장)
1. https://www.postgresql.org/download/windows/ 에서 최신 버전 다운로드
2. 설치 과정에서 다음 설정:
   - **Port**: 5432 (기본값)
   - **Superuser password**: 기억하기 쉬운 비밀번호 설정
   - **Locale**: Korean, Korea (또는 기본값)

#### Chocolatey 방법
```powershell
choco install postgresql -y
```

**설치 후 확인:**
```powershell
# 서비스 상태 확인
Get-Service -Name "postgresql*"

# psql 연결 테스트 (비밀번호 입력 필요)
psql -U postgres -h localhost
```

### 5. Redis 설치 (Windows 포트)

Windows에서는 공식 Redis가 지원되지 않으므로 커뮤니티 포트를 사용합니다.

#### 자동 설치 스크립트
```powershell
# Redis Windows 포트 다운로드 및 설치
$redisUrl = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
$redisZip = "Redis-x64-5.0.14.1.zip"
$redisPath = "C:\Redis"

# 다운로드
Invoke-WebRequest -Uri $redisUrl -OutFile $redisZip

# 압축 해제
Expand-Archive -Path $redisZip -DestinationPath $redisPath -Force

# 임시 파일 정리
Remove-Item $redisZip

# PATH에 추가 (현재 세션)
$env:PATH += ";$redisPath"

# PATH에 영구 추가 (사용자 환경변수)
[Environment]::SetEnvironmentVariable("PATH", $env:PATH, [EnvironmentVariableTarget]::User)
```

#### Redis 서버 시작
```powershell
# Redis 서버 백그라운드 실행
Start-Process -FilePath "C:\Redis\redis-server.exe" -ArgumentList "C:\Redis\redis.windows.conf" -WindowStyle Minimized
```

**설치 후 확인:**
```powershell
redis-cli ping
# 예상 출력: PONG
```

### 6. Git 설치

#### 공식 인스톨러 방법 (권장)
1. https://git-scm.com/download/win 에서 다운로드
2. 설치 시 권장 설정:
   - **Editor**: Visual Studio Code (또는 선호 에디터)
   - **Line ending conversions**: Checkout Windows-style, commit Unix-style line endings
   - **Terminal emulator**: Use Windows' default console window

#### Chocolatey 방법
```powershell
choco install git -y
```

**설치 후 확인:**
```powershell
git --version
```

## ⚙️ 환경변수 설정

### 필수 환경변수

#### 1. JAVA_HOME 설정
```powershell
# Java 설치 경로 확인
java -XshowSettings:properties -version 2>&1 | findstr "java.home"

# JAVA_HOME 설정 (경로는 실제 설치 경로로 변경)
$javaHome = "C:\java\jdk-21.0.4.7-hotspot"
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, [EnvironmentVariableTarget]::User)
$env:JAVA_HOME = $javaHome
```

#### 2. PATH 환경변수 업데이트
```powershell
# 현재 사용자 PATH에 필요한 경로들 추가
$pathsToAdd = @(
    "C:\Program Files\nodejs",
    "C:\Redis",
    "$env:JAVA_HOME\bin"
)

foreach ($path in $pathsToAdd) {
    if ($env:PATH -notlike "*$path*") {
        $env:PATH += ";$path"
    }
}

# PATH 영구 저장
[Environment]::SetEnvironmentVariable("PATH", $env:PATH, [EnvironmentVariableTarget]::User)
```

### 선택적 환경변수

```powershell
# Maven 관련
[Environment]::SetEnvironmentVariable("MAVEN_OPTS", "-Xmx2048m", [EnvironmentVariableTarget]::User)

# Node.js 관련
[Environment]::SetEnvironmentVariable("NODE_ENV", "development", [EnvironmentVariableTarget]::User)
```

## ✅ 검증 방법

### 종합 검증 스크립트
```powershell
Write-Host "=== 개발환경 검증 ===" -ForegroundColor Green
Write-Host ""

# Java 검증
Write-Host "1. Java:" -ForegroundColor Yellow
java -version
Write-Host "JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Gray
Write-Host ""

# Maven 검증
Write-Host "2. Maven:" -ForegroundColor Yellow
mvn -version | Select-String "Apache Maven", "Java version"
Write-Host ""

# Node.js 검증
Write-Host "3. Node.js:" -ForegroundColor Yellow
Write-Host "Node.js: $(node --version)" -ForegroundColor Gray
Write-Host "NPM: $(npm --version)" -ForegroundColor Gray
Write-Host ""

# PostgreSQL 검증
Write-Host "4. PostgreSQL:" -ForegroundColor Yellow
Get-Service -Name "postgresql*" | Format-Table Name, Status -AutoSize
Write-Host ""

# Redis 검증
Write-Host "5. Redis:" -ForegroundColor Yellow
try {
    $pingResult = redis-cli ping
    Write-Host "Redis 연결: $pingResult" -ForegroundColor Gray
    $version = redis-cli info server | Select-String "redis_version"
    Write-Host "$version" -ForegroundColor Gray
} catch {
    Write-Host "Redis가 실행되지 않음" -ForegroundColor Red
}
Write-Host ""

# Git 검증
Write-Host "6. Git:" -ForegroundColor Yellow
git --version
Write-Host ""

Write-Host "=== 검증 완료 ===" -ForegroundColor Green
```

### 개별 서비스 상태 확인

#### PostgreSQL 연결 테스트
```powershell
# 기본 연결 테스트 (비밀번호 입력 필요)
psql -U postgres -h localhost -c "SELECT version();"
```

#### Redis 기능 테스트
```powershell
# 기본 기능 테스트
redis-cli set test-key "Hello World"
redis-cli get test-key
redis-cli del test-key
```

#### Node.js 패키지 매니저 테스트
```powershell
# 글로벌 패키지 설치 테스트
npm install -g npm@latest
```

## 🔧 자동화 스크립트

### 전체 환경 구성 자동화 스크립트

다음 스크립트를 `setup-development-environment.ps1`로 저장하여 사용:

```powershell
#Requires -RunAsAdministrator

param(
    [switch]$SkipChocolatey,
    [switch]$SkipJava,
    [switch]$SkipNodejs,
    [switch]$SkipRedis
)

Write-Host "=== Windows 개발환경 자동 구성 스크립트 ===" -ForegroundColor Green
Write-Host "시작 시간: $(Get-Date)" -ForegroundColor Gray
Write-Host ""

# Chocolatey 설치 확인 및 설치
if (-not $SkipChocolatey) {
    Write-Host "Chocolatey 확인 중..." -ForegroundColor Yellow
    try {
        choco --version | Out-Null
        Write-Host "✓ Chocolatey가 이미 설치되어 있습니다." -ForegroundColor Green
    } catch {
        Write-Host "Chocolatey 설치 중..." -ForegroundColor Yellow
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    }
}

# Java 설치
if (-not $SkipJava) {
    Write-Host "Java 21 설치 중..." -ForegroundColor Yellow
    choco install openjdk21 -y
    
    # JAVA_HOME 설정
    $javaPath = Get-ChildItem "C:\Program Files\OpenJDK" | Where-Object {$_.Name -like "*21*"} | Select-Object -First 1 -ExpandProperty FullName
    if ($javaPath) {
        [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaPath, [EnvironmentVariableTarget]::Machine)
        Write-Host "✓ JAVA_HOME 설정됨: $javaPath" -ForegroundColor Green
    }
}

# Maven 설치
Write-Host "Maven 설치 중..." -ForegroundColor Yellow
choco install maven -y

# Git 설치
Write-Host "Git 설치 중..." -ForegroundColor Yellow
choco install git -y

# PostgreSQL 설치
Write-Host "PostgreSQL 설치 중..." -ForegroundColor Yellow
choco install postgresql -y --params '/Password:postgres123'

# Node.js 설치 (선택적)
if (-not $SkipNodejs) {
    Write-Host "Node.js 설치 중..." -ForegroundColor Yellow
    choco install nodejs -y
}

# Redis 설치 (선택적)
if (-not $SkipRedis) {
    Write-Host "Redis 설치 중..." -ForegroundColor Yellow
    $redisUrl = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
    $redisZip = "$env:TEMP\Redis-x64-5.0.14.1.zip"
    $redisPath = "C:\Redis"
    
    Invoke-WebRequest -Uri $redisUrl -OutFile $redisZip
    Expand-Archive -Path $redisZip -DestinationPath $redisPath -Force
    Remove-Item $redisZip
    
    # PATH에 Redis 추가
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::Machine)
    if ($currentPath -notlike "*$redisPath*") {
        [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$redisPath", [EnvironmentVariableTarget]::Machine)
    }
}

Write-Host ""
Write-Host "=== 설치 완료 ===" -ForegroundColor Green
Write-Host "시스템을 재시작한 후 환경변수가 적용됩니다." -ForegroundColor Yellow
Write-Host "완료 시간: $(Get-Date)" -ForegroundColor Gray
```

### 사용법
```powershell
# 관리자 권한으로 PowerShell 실행 후
.\setup-development-environment.ps1

# 특정 구성 요소 제외하고 설치
.\setup-development-environment.ps1 -SkipNodejs -SkipRedis
```

## 🚨 트러블슈팅

### 일반적인 문제 해결

#### 1. PATH 환경변수가 인식되지 않는 경우
```powershell
# PowerShell 재시작 또는 환경변수 새로고침
refreshenv

# 또는 새로운 PowerShell 세션 시작
```

#### 2. Java 버전 충돌
```powershell
# 설치된 모든 Java 버전 확인
Get-ChildItem "C:\Program Files\Java", "C:\Program Files\OpenJDK" -ErrorAction SilentlyContinue

# JAVA_HOME 재설정
[Environment]::SetEnvironmentVariable("JAVA_HOME", "올바른경로", [EnvironmentVariableTarget]::User)
```

#### 3. PostgreSQL 서비스 시작 실패
```powershell
# 서비스 상태 확인
Get-Service postgresql*

# 수동 서비스 시작
Start-Service postgresql-x64-17

# 로그 확인 (설치 경로의 log 폴더)
Get-Content "C:\Program Files\PostgreSQL\17\data\log\*.log" | Select-Object -Last 20
```

#### 4. Redis 연결 실패
```powershell
# Redis 프로세스 확인
Get-Process redis-server -ErrorAction SilentlyContinue

# Redis 수동 시작
Start-Process "C:\Redis\redis-server.exe" -ArgumentList "C:\Redis\redis.windows.conf"

# 포트 사용 확인
netstat -an | Select-String ":6379"
```

#### 5. Maven 빌드 실패
```powershell
# Maven 설정 확인
mvn -version

# 로컬 저장소 정리
mvn dependency:purge-local-repository

# 설정 파일 위치 확인
echo $env:USERPROFILE\.m2\settings.xml
```

### 권한 문제 해결

#### Chocolatey 설치 권한 오류
```powershell
# PowerShell을 관리자 권한으로 실행
# 또는 사용자 설치 모드 사용
```

#### 환경변수 설정 권한 오류
```powershell
# 사용자 환경변수 사용 (관리자 권한 불필요)
[Environment]::SetEnvironmentVariable("변수명", "값", [EnvironmentVariableTarget]::User)
```

## 📈 추가 권장사항

### 1. 개발 도구 설치
```powershell
# Visual Studio Code
choco install vscode -y

# IntelliJ IDEA Community Edition
choco install intellijidea-community -y

# Postman (API 테스트)
choco install postman -y

# DBeaver (데이터베이스 관리)
choco install dbeaver -y
```

### 2. 성능 최적화

#### JVM 메모리 설정
```powershell
# Maven JVM 옵션
[Environment]::SetEnvironmentVariable("MAVEN_OPTS", "-Xmx4g -Xms1g", [EnvironmentVariableTarget]::User)

# Gradle JVM 옵션 (필요한 경우)
[Environment]::SetEnvironmentVariable("GRADLE_OPTS", "-Xmx4g -Xms1g", [EnvironmentVariableTarget]::User)
```

#### PostgreSQL 설정 최적화
```sql
-- postgresql.conf 권장 설정
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
```

### 3. 보안 설정

#### PostgreSQL 보안
```sql
-- 개발용 사용자 생성
CREATE USER dev_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE dev_database TO dev_user;
```

#### Redis 보안 (개발 환경)
```
# redis.conf 설정
requirepass your_secure_password
bind 127.0.0.1
```

### 4. 백업 및 복원

#### 개발환경 프로파일 저장
```powershell
# 현재 환경변수를 파일로 백업
Get-ChildItem Env: | Out-File "development-environment-backup.txt"

# PATH 백업
echo $env:PATH | Out-File "path-backup.txt"
```

## 📚 참고 자료

- [OpenJDK 공식 문서](https://openjdk.java.net/)
- [Maven 공식 문서](https://maven.apache.org/)
- [Node.js 공식 문서](https://nodejs.org/)
- [PostgreSQL Windows 설치 가이드](https://www.postgresql.org/docs/current/install-windows.html)
- [Redis Windows 포트](https://github.com/tporadowski/redis)
- [Git Windows 설치 가이드](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [Chocolatey 공식 문서](https://chocolatey.org/docs)

## 📝 버전 히스토리

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| 1.0 | 2025-09-30 | 초기 버전 생성 |

---

**작성자**: Development Team  
**최종 수정**: 2025-09-30  
**다음 리뷰 예정**: 2025-12-30  

> 이 문서는 모든 신규 프로젝트의 개발환경 표준으로 사용되며, 정기적으로 업데이트됩니다.