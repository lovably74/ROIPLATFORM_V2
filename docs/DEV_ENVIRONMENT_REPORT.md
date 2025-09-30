# 🔍 ROIPLATFORM V2 - 개발 환경 검증 보고서

> **검증 일시**: 2025-09-30 15:46:54  
> **환경**: Windows 11, PowerShell 5.1

## ✅ 설치 완료된 프로그램

### 1. **Java 21** ✅ **완벽**
```
✅ OpenJDK 21.0.4 2024-07-16 LTS
✅ OpenJDK Runtime Environment Microsoft-9889606
✅ javac 21.0.4
```

### 2. **Maven** ✅ **완벽**
```
✅ Apache Maven 3.9.11
✅ Java version: 21.0.4, vendor: Microsoft
✅ Platform encoding: UTF-8
```

### 3. **PostgreSQL** ✅ **완벽**
```
✅ PostgreSQL 17.4 (최신 버전 - 요구사항 15+ 충족)
✅ 서비스 실행 중: postgresql-x64-17
✅ psql 클라이언트 사용 가능
```

### 4. **Git** ✅ **완벽**
```
✅ Git version 2.41.0.windows.3
```

## ⚠️ 설정 필요한 항목

### 1. **Node.js PATH 설정** 🔧 **수정 필요**
```
❌ 'node' 명령어가 PATH에서 인식되지 않음
✅ Node.js v22.20.0 설치 확인됨 (C:\Program Files\nodejs\)
🔧 PATH 환경 변수 설정 필요
```

### 2. **JAVA_HOME 환경 변수** 🔧 **설정 필요**
```
❌ JAVA_HOME 환경 변수가 설정되지 않음
✅ Java는 정상 작동 중
🔧 JAVA_HOME 설정 권장
```

## ❌ 설치 필요한 프로그램

### 1. **Redis/Memurai** ❌ **설치 필요**
```
❌ redis-cli 명령어 없음
❌ Memurai 서비스 없음
❌ Redis 서비스 없음
🚨 캐시 및 세션 저장소 필요
```

---

## 🛠️ 해결 방법 가이드

### 1️⃣ Node.js PATH 설정

#### 방법 A: 시스템 환경 변수에서 설정
```powershell
# 시스템 속성 > 고급 > 환경 변수 > 시스템 변수 > Path 편집
# 추가할 경로: C:\Program Files\nodejs
```

#### 방법 B: PowerShell로 즉시 설정
```powershell
# 현재 세션에서만 유효
$env:PATH += ";C:\Program Files\nodejs"

# 영구 설정 (관리자 권한 필요)
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\Program Files\nodejs", [EnvironmentVariableTarget]::Machine)
```

#### 방법 C: PowerShell 프로파일에 추가
```powershell
# PowerShell 프로파일 편집
notepad $PROFILE

# 다음 라인 추가:
$env:PATH += ";C:\Program Files\nodejs"
```

### 2️⃣ JAVA_HOME 환경 변수 설정

#### Maven에서 감지한 Java 경로 사용
```powershell
# 현재 세션에서 설정
$env:JAVA_HOME = "C:\java\jdk-21.0.4.7-hotspot"

# 영구 설정 (관리자 권한 필요)
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\java\jdk-21.0.4.7-hotspot", [EnvironmentVariableTarget]::Machine)

# 설정 확인
echo $env:JAVA_HOME
java --version
```

### 3️⃣ Redis/Memurai 설치

#### 방법 A: Memurai Developer 설치 (권장)
```powershell
# 1. https://www.memurai.com/get-memurai 에서 Developer Edition 다운로드
# 2. 설치 프로그램 실행
# 3. 기본 설정으로 설치 (포트: 6379)

# 설치 확인
memurai-cli ping  # 응답: PONG
```

#### 방법 B: Chocolatey로 Redis 설치
```powershell
# Chocolatey가 설치되어 있다면
choco install redis-64 -y

# 서비스 시작
redis-server --service-install
redis-server --service-start

# 연결 테스트
redis-cli ping
```

#### 방법 C: WSL에서 Redis 실행
```powershell
# WSL 설치 (이미 설치되어 있을 수 있음)
wsl --install

# Ubuntu에서 Redis 설치
wsl -d Ubuntu
sudo apt update
sudo apt install redis-server -y

# Redis 서비스 시작
sudo service redis-server start

# Windows에서 WSL Redis 접근
redis-cli -h 127.0.0.1 ping  # WSL의 Redis에 연결
```

---

## 🚀 설정 완료 후 검증

### 모든 설정 완료 후 실행할 명령어:

```powershell
# 1. Node.js 확인
node --version
npm --version

# 2. Java 환경 확인
echo $env:JAVA_HOME
java --version
javac --version

# 3. Redis 연결 확인
redis-cli ping
# 또는
memurai-cli ping

# 4. PostgreSQL 연결 확인
psql -U postgres -c "SELECT 1;"

# 5. Maven 프로젝트 테스트
cd backend/roiplatform-gateway
./mvnw --version
```

---

## 📋 빠른 설정 스크립트

### PowerShell 스크립트로 한 번에 설정:

```powershell
# ====================================================
# ROIPLATFORM V2 - 개발 환경 자동 설정 스크립트
# ====================================================

Write-Host "🔧 ROIPLATFORM 개발 환경 설정 중..." -ForegroundColor Cyan

# 1. Node.js PATH 설정
Write-Host "1️⃣ Node.js PATH 설정..." -ForegroundColor Yellow
if (Test-Path "C:\Program Files\nodejs") {
    $env:PATH += ";C:\Program Files\nodejs"
    Write-Host "✅ Node.js PATH 설정 완료" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js가 설치되지 않았습니다." -ForegroundColor Red
}

# 2. JAVA_HOME 설정
Write-Host "2️⃣ JAVA_HOME 설정..." -ForegroundColor Yellow
$javaPath = "C:\java\jdk-21.0.4.7-hotspot"
if (Test-Path $javaPath) {
    $env:JAVA_HOME = $javaPath
    Write-Host "✅ JAVA_HOME 설정 완료: $env:JAVA_HOME" -ForegroundColor Green
} else {
    Write-Host "❌ Java 설치 경로를 찾을 수 없습니다." -ForegroundColor Red
}

# 3. 환경 변수 확인
Write-Host "3️⃣ 환경 변수 확인..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js 설정 실패" -ForegroundColor Red
}

try {
    $javaVersion = java --version | Select-Object -First 1
    Write-Host "✅ Java: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Java 설정 실패" -ForegroundColor Red
}

Write-Host "🎉 기본 설정 완료! Redis/Memurai는 수동 설치 필요합니다." -ForegroundColor Cyan
```

---

## 🎯 우선순위 및 권장사항

### 🔥 **즉시 해결 필요 (High Priority)**
1. **Node.js PATH 설정** - Vue 프론트엔드 개발 필수
2. **Redis/Memurai 설치** - 세션 및 캐시 저장소 필수

### ⚡ **권장 설정 (Medium Priority)**  
1. **JAVA_HOME 환경 변수** - IDE 통합 및 Maven 최적화
2. **PowerShell 프로파일 설정** - 개발 환경 자동 로딩

### 📚 **추가 도구 (Optional)**
1. **pgAdmin** - PostgreSQL GUI 관리 도구
2. **Redis Desktop Manager** - Redis GUI 관리 도구
3. **Postman** - API 테스트 도구

---

## 📞 문제 해결

### 자주 발생하는 문제들

#### 1. PATH 설정이 적용되지 않는 경우
```powershell
# PowerShell 재시작 또는 새 터미널 열기
# 또는 현재 세션에서 강제 적용:
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", [System.EnvironmentVariableTarget]::Machine)
```

#### 2. Redis 연결 실패
```powershell
# Windows Defender 방화벽 확인
# 또는 WSL 네트워크 설정 확인
netstat -an | findstr :6379  # Redis 포트 확인
```

#### 3. PostgreSQL 연결 오류
```powershell
# 서비스 상태 확인
Get-Service postgresql*

# 연결 테스트
psql -U postgres -h localhost -c "SELECT version();"
```

---

**📝 결론**: 대부분의 필수 프로그램이 설치되어 있으나, **Node.js PATH 설정**과 **Redis/Memurai 설치**가 완료되면 개발 환경이 완벽하게 구축됩니다!