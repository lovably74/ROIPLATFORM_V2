# ROIPLATFORM 개발환경 시작 스크립트
# Windows PowerShell 5.1+ 지원

param(
    [switch]$Clean,           # 모든 컨테이너와 볼륨 삭제 후 재시작
    [switch]$Infrastructure,  # 인프라만 시작 (PostgreSQL, Redis, RabbitMQ)
    [switch]$Services,        # 백엔드 서비스들도 시작
    [switch]$Frontend,        # 프론트엔드도 시작
    [switch]$Stop,            # 모든 서비스 중지
    [switch]$Status,          # 서비스 상태 확인
    [switch]$Logs,            # 로그 확인
    [string]$Service = ""     # 특정 서비스 로그 확인
)

$ErrorActionPreference = "Stop"

# 색상 출력 함수
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    
    $oldColor = $Host.UI.RawUI.ForegroundColor
    try {
        $Host.UI.RawUI.ForegroundColor = $Color
        Write-Output $Message
    } finally {
        $Host.UI.RawUI.ForegroundColor = $oldColor
    }
}

function Write-Header {
    param([string]$Title)
    Write-ColorOutput "`n========================================" "Cyan"
    Write-ColorOutput $Title "Cyan"
    Write-ColorOutput "========================================`n" "Cyan"
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "✅ $Message" "Green"
}

function Write-Warning {
    param([string]$Message)
    Write-ColorOutput "⚠️  $Message" "Yellow"
}

function Write-Error {
    param([string]$Message)
    Write-ColorOutput "❌ $Message" "Red"
}

# 프로젝트 루트 디렉토리 설정
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DevEnvPath = Join-Path $ProjectRoot "dev-environment"
$DockerComposePath = Join-Path $DevEnvPath "docker-compose.dev.yml"
$EnvFilePath = Join-Path $DevEnvPath ".env"

# 현재 디렉토리 변경
Set-Location $ProjectRoot

Write-Header "ROIPLATFORM 개발환경 관리 스크립트"
Write-Output "프로젝트 루트: $ProjectRoot"
Write-Output "환경 파일: $EnvFilePath"
Write-Output "Docker Compose: $DockerComposePath`n"

# Docker 및 Docker Compose 설치 확인
function Test-Prerequisites {
    Write-Output "필수 프로그램 확인 중..."
    
    try {
        $dockerVersion = docker --version 2>$null
        if ($dockerVersion) {
            Write-Success "Docker: $dockerVersion"
        } else {
            Write-Error "Docker가 설치되지 않았거나 실행되지 않고 있습니다."
            Write-Output "Docker Desktop을 설치하고 실행한 후 다시 시도해주세요."
            exit 1
        }
    } catch {
        Write-Error "Docker를 확인할 수 없습니다: $_"
        exit 1
    }
    
    try {
        $composeVersion = docker compose version 2>$null
        if ($composeVersion) {
            Write-Success "Docker Compose: $composeVersion"
        } else {
            Write-Error "Docker Compose가 설치되지 않았습니다."
            exit 1
        }
    } catch {
        Write-Error "Docker Compose를 확인할 수 없습니다: $_"
        exit 1
    }
    
    # Node.js 확인
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Success "Node.js: $nodeVersion"
        } else {
            Write-Warning "Node.js가 설치되지 않았습니다. 백엔드 서비스 실행 시 필요합니다."
        }
    } catch {
        Write-Warning "Node.js를 확인할 수 없습니다."
    }
    
    # Java 확인
    try {
        $javaVersion = java -version 2>&1 | Select-Object -First 1
        if ($javaVersion) {
            Write-Success "Java: $javaVersion"
        } else {
            Write-Warning "Java가 설치되지 않았습니다. Java 서비스 실행 시 필요합니다."
        }
    } catch {
        Write-Warning "Java를 확인할 수 없습니다."
    }
    
    Write-Output ""
}

# 서비스 상태 확인
function Get-ServiceStatus {
    Write-Header "서비스 상태 확인"
    
    try {
        docker compose -f $DockerComposePath ps
    } catch {
        Write-Error "Docker 서비스 상태를 확인할 수 없습니다: $_"
    }
    
    Write-Output "`n주요 엔드포인트:"
    Write-Output "• PostgreSQL: localhost:5432"
    Write-Output "• Redis: localhost:6379" 
    Write-Output "• RabbitMQ: localhost:5672 (Management: http://localhost:15672)"
    Write-Output "• pgAdmin: http://localhost:8081"
    Write-Output "• Frontend: http://localhost:3000"
    Write-Output "• API Gateway: http://localhost:8000"
}

# 로그 확인
function Show-Logs {
    param([string]$ServiceName)
    
    if ($ServiceName) {
        Write-Header "[$ServiceName] 서비스 로그"
        try {
            docker compose -f $DockerComposePath logs -f $ServiceName
        } catch {
            Write-Error "$ServiceName 서비스의 로그를 확인할 수 없습니다: $_"
        }
    } else {
        Write-Header "모든 서비스 로그"
        try {
            docker compose -f $DockerComposePath logs -f
        } catch {
            Write-Error "서비스 로그를 확인할 수 없습니다: $_"
        }
    }
}

# 인프라 서비스 시작
function Start-Infrastructure {
    param([bool]$CleanStart = $false)
    
    Write-Header "인프라 서비스 시작"
    
    if ($CleanStart) {
        Write-Warning "기존 컨테이너와 볼륨을 모두 삭제합니다..."
        try {
            docker compose -f $DockerComposePath down -v --remove-orphans 2>$null
            Write-Success "기존 환경 정리 완료"
        } catch {
            Write-Warning "기존 환경 정리 중 일부 오류가 발생했습니다: $_"
        }
    }
    
    Write-Output "PostgreSQL, Redis, RabbitMQ, pgAdmin 시작 중..."
    
    try {
        # 환경 변수 파일 확인
        if (Test-Path $EnvFilePath) {
            Write-Success "환경 변수 파일 발견: $EnvFilePath"
        } else {
            Write-Warning "환경 변수 파일이 없습니다. 기본값을 사용합니다."
        }
        
        docker compose -f $DockerComposePath up -d postgres redis rabbitmq pgadmin
        
        Write-Success "인프라 서비스가 시작되었습니다!"
        
        # 서비스 헬스체크 대기
        Write-Output "`n서비스 준비 상태 확인 중..."
        $maxAttempts = 30
        $attempt = 0
        
        do {
            $attempt++
            Start-Sleep -Seconds 2
            
            $postgresHealth = docker inspect roiplatform_postgres --format='{{.State.Health.Status}}' 2>$null
            
            if ($postgresHealth -eq "healthy") {
                Write-Success "PostgreSQL이 준비되었습니다!"
                break
            } elseif ($attempt -ge $maxAttempts) {
                Write-Warning "PostgreSQL 헬스체크 시간이 초과되었습니다. 수동으로 확인해주세요."
                break
            } else {
                Write-Output "PostgreSQL 대기 중... ($attempt/$maxAttempts)"
            }
        } while ($true)
        
    } catch {
        Write-Error "인프라 서비스 시작 중 오류가 발생했습니다: $_"
        exit 1
    }
}

# 서비스 중지
function Stop-Services {
    Write-Header "모든 서비스 중지"
    
    try {
        docker compose -f $DockerComposePath down
        Write-Success "모든 서비스가 중지되었습니다."
    } catch {
        Write-Error "서비스 중지 중 오류가 발생했습니다: $_"
    }
}

# 개발 정보 출력
function Show-DevelopmentInfo {
    Write-Header "개발환경 정보"
    
    Write-Output "📋 개발용 계정 정보:"
    Write-Output "   • 관리자: admin@roiplatform.com / password123"
    Write-Output "   • 데모: demo@company.com / password123" 
    Write-Output "   • 테스트: test@example.com / password123"
    Write-Output "   • 매니저: manager@demo.com / password123"
    Write-Output ""
    
    Write-Output "🌐 접속 URL:"
    Write-Output "   • 공용 프로젝트: http://localhost:3000/public"
    Write-Output "   • 데모 프로젝트: http://localhost:3000/demo1234"
    Write-Output "   • 테스트 프로젝트: http://localhost:3000/testproject"
    Write-Output ""
    
    Write-Output "🔧 관리 도구:"
    Write-Output "   • pgAdmin: http://localhost:8081 (admin@local / admin1234)"
    Write-Output "   • RabbitMQ: http://localhost:15672 (guest / guest)"
    Write-Output ""
    
    Write-Output "📊 개발 가이드:"
    Write-Output "   • 컴플라이언스 대시보드: /compliance"
    Write-Output "   • KISA 가이드라인 체크리스트 포함"
    Write-Output "   • KWCAG 2.2 웹 접근성 지원"
    Write-Output "   • 실시간 보안 감사 로그"
    Write-Output ""
    
    Write-ColorOutput "🚀 개발환경이 준비되었습니다!" "Green"
}

# 백엔드 서비스 시작 (추후 구현)
function Start-BackendServices {
    Write-Header "백엔드 서비스 시작 (추후 구현)"
    Write-Warning "백엔드 서비스는 개별적으로 IDE에서 실행하거나 별도 스크립트를 사용해주세요."
    
    Write-Output "예상 서비스 포트:"
    Write-Output "   • API Gateway: 8000"
    Write-Output "   • Auth Service: 8001" 
    Write-Output "   • Tenant Service: 8002"
    Write-Output "   • I18N Service: 8003"
    Write-Output "   • Compliance Service: 8008"
}

# 프론트엔드 시작 (추후 구현)
function Start-Frontend {
    Write-Header "프론트엔드 시작 (추후 구현)"
    Write-Warning "프론트엔드는 별도 터미널에서 'npm start' 명령을 사용해주세요."
    
    Write-Output "프론트엔드 디렉토리: $ProjectRoot\frontend"
    Write-Output "예상 URL: http://localhost:3000"
}

# 메인 로직
function Main {
    # 매개변수 검증
    if ($Stop) {
        Test-Prerequisites
        Stop-Services
        return
    }
    
    if ($Status) {
        Test-Prerequisites
        Get-ServiceStatus
        return
    }
    
    if ($Logs) {
        Show-Logs -ServiceName $Service
        return
    }
    
    # 기본 동작: 인프라 시작
    Test-Prerequisites
    Start-Infrastructure -CleanStart $Clean
    
    if ($Services) {
        Start-BackendServices
    }
    
    if ($Frontend) {
        Start-Frontend
    }
    
    Get-ServiceStatus
    Show-DevelopmentInfo
    
    Write-Output "`n다음 명령으로 서비스를 관리할 수 있습니다:"
    Write-Output "   • 상태 확인: .\scripts\start-dev-env.ps1 -Status"
    Write-Output "   • 로그 확인: .\scripts\start-dev-env.ps1 -Logs"
    Write-Output "   • 서비스 중지: .\scripts\start-dev-env.ps1 -Stop"
    Write-Output "   • 완전 재시작: .\scripts\start-dev-env.ps1 -Clean"
}

# 스크립트 실행
try {
    Main
} catch {
    Write-Error "스크립트 실행 중 오류가 발생했습니다: $_"
    Write-Output "스택 트레이스: $($_.ScriptStackTrace)"
    exit 1
}