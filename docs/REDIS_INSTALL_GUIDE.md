# Redis/Memurai 설치 가이드 (Windows)

Windows에서는 공식 Redis보다 Memurai를 권장합니다 (Redis의 Windows용 포크).

## 1. Memurai 다운로드

### 옵션 1: Memurai (권장)
1. **공식 사이트**: https://www.memurai.com/
2. **직접 다운로드**: https://download.memurai.com/Memurai-Developer-v4.0.8-x64.msi

### 옵션 2: Redis (WSL 필요)
1. Windows Subsystem for Linux (WSL) 설치 필요
2. Ubuntu에서 Redis 설치

## 2. Memurai 설치

### 설치 실행
1. `Memurai-Developer-v4.0.8-x64.msi` 파일을 관리자 권한으로 실행
2. 기본 설치 경로: `C:\Program Files\Memurai\` 사용 권장

### 설치 설정값
- **Port**: `6379` (기본값)
- **Max Memory**: `256MB` (개발용, 필요시 조정 가능)
- **Service 설치**: 체크 (자동 시작 설정)

## 3. 환경변수 설정

### PowerShell에서 환경변수 추가:
```powershell
# 시스템 PATH에 Memurai 경로 추가
$env:PATH += ";C:\Program Files\Memurai"

# 영구적으로 PATH 설정 (관리자 권한 필요)
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\Program Files\Memurai", "Machine")
```

## 4. 설치 확인

설치가 완료되면 다음 명령어로 확인:

### Memurai 서비스 확인
```powershell
# Memurai 서비스 상태 확인
Get-Service -Name "*memurai*"

# 서비스 시작 (필요시)
Start-Service -Name "Memurai"
```

### 연결 테스트
```powershell
# Memurai CLI 연결 테스트
memurai-cli ping
# 응답: PONG

# 또는 Redis CLI 명령어 사용
redis-cli ping
```

## 5. 기본 설정

### Memurai 설정 파일
설정 파일 위치: `C:\Program Files\Memurai\memurai.conf`

기본 설정에서 변경이 필요한 항목:
```conf
# 비밀번호 설정 (선택사항 - 개발환경)
# requirepass your_password_here

# 최대 메모리 설정
maxmemory 256mb
maxmemory-policy allkeys-lru

# 로그 레벨
loglevel notice

# 데이터 저장 방식
save 900 1
save 300 10
save 60 10000
```

## 6. 대안: WSL에서 Redis 설치

### WSL 설치 및 Redis 설치
```powershell
# WSL 설치 (관리자 PowerShell에서)
wsl --install

# WSL Ubuntu에서 Redis 설치
wsl
sudo apt update
sudo apt install redis-server

# Redis 시작
sudo service redis-server start

# 연결 테스트
redis-cli ping
```

## 7. 연결 정보

설치 완료 후 프로젝트에서 사용할 연결 정보:

### Memurai 사용시
```
Host: localhost
Port: 6379
Password: (설정하지 않았다면 비워둠)
```

### WSL Redis 사용시
```
Host: localhost (또는 WSL IP)
Port: 6379
Password: (기본적으로 없음)
```

## 8. 성능 테스트

설치 후 성능 테스트:

```powershell
# Memurai 성능 테스트
memurai-benchmark -h localhost -p 6379 -n 10000 -c 10

# 또는
redis-benchmark -h localhost -p 6379 -n 10000 -c 10
```

## 9. GUI 도구 (선택사항)

Redis 데이터를 시각적으로 관리할 수 있는 도구들:

1. **Redis Desktop Manager**: https://resp.app/
2. **RedisInsight**: https://redis.com/redis-enterprise/redis-insight/
3. **Medis**: https://getmedis.com/

## 트러블슈팅

### 포트 충돌 확인
```powershell
# 6379 포트 사용 확인
netstat -ano | findstr :6379
```

### 서비스 수동 시작
```powershell
# Memurai 서비스 시작
Start-Service -Name "Memurai"

# 서비스 상태 확인
Get-Service -Name "Memurai"
```

### 방화벽 설정
Windows Defender 방화벽에서 Memurai/Redis 허용이 필요할 수 있음.

## 권장사항

개발 환경에서는 **Memurai**를 권장합니다:
- Windows에 최적화됨
- Redis와 완전 호환
- 설치 및 관리가 쉬움
- 공식 지원