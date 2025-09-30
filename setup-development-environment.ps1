#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Windows 개발환경 자동 구성 스크립트

.DESCRIPTION
    Java, Maven, Node.js, PostgreSQL, Redis, Git 등 풀스택 개발에 필요한
    모든 도구를 자동으로 설치하고 환경을 구성하는 스크립트입니다.

.PARAMETER SkipChocolatey
    Chocolatey 설치를 건너뜁니다.

.PARAMETER SkipJava
    Java 설치를 건너뜁니다.

.PARAMETER SkipNodejs  
    Node.js 설치를 건너뜁니다.

.PARAMETER SkipRedis
    Redis 설치를 건너뜁니다.

.PARAMETER SkipPostgreSQL
    PostgreSQL 설치를 건너뜁니다.

.PARAMETER Verify
    설치 후 모든 구성 요소의 상태를 검증합니다.

.EXAMPLE
    .\setup-development-environment.ps1
    모든 구성 요소를 설치합니다.

.EXAMPLE
    .\setup-development-environment.ps1 -SkipNodejs -SkipRedis -Verify
    Node.js와 Redis 설치를 건너뛰고, 설치 후 검증을 수행합니다.

.NOTES
    작성자: Development Team
    작성일: 2025-09-30
    버전: 1.0
    관리자 권한이 필요합니다.
#>

param(
    [switch]$SkipChocolatey,
    [switch]$SkipJava,
    [switch]$SkipNodejs,
    [switch]$SkipRedis,
    [switch]$SkipPostgreSQL,
    [switch]$Verify
)

# 전역 변수
$LogFile = "development-environment-setup.log"
$StartTime = Get-Date

# 로깅 함수
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    switch ($Level) {
        "ERROR" { Write-Host $logMessage -ForegroundColor Red }
        "WARNING" { Write-Host $logMessage -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $logMessage -ForegroundColor Green }
        default { Write-Host $logMessage -ForegroundColor White }
    }
    
    Add-Content -Path $LogFile -Value $logMessage
}

# 진행 상황 표시 함수
function Show-Progress {
    param(
        [string]$Activity,
        [string]$Status,
        [int]$PercentComplete
    )
    Write-Progress -Activity $Activity -Status $Status -PercentComplete $PercentComplete
}

# 관리자 권한 확인
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 서비스 상태 확인 함수
function Test-Service {
    param([string]$ServiceName)
    try {
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        return $service -and $service.Status -eq 'Running'
    } catch {
        return $false
    }
}

# 명령어 존재 확인 함수
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction SilentlyContinue | Out-Null
        return $true
    } catch {
        return $false
    }
}

# 메인 설치 함수들
function Install-Chocolatey {
    if (-not $SkipChocolatey) {
        Write-Log "Chocolatey 설치 상태 확인 중..."
        Show-Progress "Chocolatey 설치" "확인 중..." 10
        
        if (Test-Command "choco") {
            Write-Log "✓ Chocolatey가 이미 설치되어 있습니다." "SUCCESS"
        } else {
            Write-Log "Chocolatey 설치 중..." "INFO"
            try {
                Set-ExecutionPolicy Bypass -Scope Process -Force
                [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
                Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
                Write-Log "✓ Chocolatey 설치 완료" "SUCCESS"
            } catch {
                Write-Log "Chocolatey 설치 실패: $($_.Exception.Message)" "ERROR"
                return $false
            }
        }
    }
    return $true
}

function Install-Java {
    if (-not $SkipJava) {
        Write-Log "Java 21 설치 중..." "INFO"
        Show-Progress "Java 설치" "OpenJDK 21 설치 중..." 25
        
        try {
            choco install openjdk21 -y
            
            # JAVA_HOME 설정
            $javaPath = Get-ChildItem "C:\Program Files\OpenJDK" | Where-Object {$_.Name -like "*21*"} | Select-Object -First 1 -ExpandProperty FullName
            if (-not $javaPath) {
                # 다른 경로에서 Java 찾기
                $javaPath = Get-ChildItem "C:\java" -ErrorAction SilentlyContinue | Where-Object {$_.Name -like "*jdk-21*"} | Select-Object -First 1 -ExpandProperty FullName
            }
            
            if ($javaPath) {
                [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaPath, [EnvironmentVariableTarget]::User)
                $env:JAVA_HOME = $javaPath
                Write-Log "✓ JAVA_HOME 설정됨: $javaPath" "SUCCESS"
            } else {
                Write-Log "Java 설치 경로를 찾을 수 없습니다." "WARNING"
            }
            
            Write-Log "✓ Java 21 설치 완료" "SUCCESS"
        } catch {
            Write-Log "Java 설치 실패: $($_.Exception.Message)" "ERROR"
            return $false
        }
    }
    return $true
}

function Install-Maven {
    Write-Log "Maven 설치 중..." "INFO"
    Show-Progress "Maven 설치" "Maven 설치 중..." 35
    
    try {
        choco install maven -y
        Write-Log "✓ Maven 설치 완료" "SUCCESS"
    } catch {
        Write-Log "Maven 설치 실패: $($_.Exception.Message)" "ERROR"
        return $false
    }
    return $true
}

function Install-Git {
    Write-Log "Git 설치 중..." "INFO"
    Show-Progress "Git 설치" "Git 설치 중..." 45
    
    try {
        choco install git -y
        Write-Log "✓ Git 설치 완료" "SUCCESS"
    } catch {
        Write-Log "Git 설치 실패: $($_.Exception.Message)" "ERROR"
        return $false
    }
    return $true
}

function Install-PostgreSQL {
    if (-not $SkipPostgreSQL) {
        Write-Log "PostgreSQL 설치 중..." "INFO"
        Show-Progress "PostgreSQL 설치" "PostgreSQL 17 설치 중..." 55
        
        try {
            choco install postgresql -y --params '/Password:postgres123'
            Write-Log "✓ PostgreSQL 설치 완료 (기본 비밀번호: postgres123)" "SUCCESS"
        } catch {
            Write-Log "PostgreSQL 설치 실패: $($_.Exception.Message)" "ERROR"
            return $false
        }
    }
    return $true
}

function Install-Nodejs {
    if (-not $SkipNodejs) {
        Write-Log "Node.js 설치 중..." "INFO"
        Show-Progress "Node.js 설치" "Node.js LTS 설치 중..." 65
        
        try {
            choco install nodejs -y
            
            # PATH에 Node.js 추가 확인
            $nodePath = "C:\Program Files\nodejs"
            if ($env:PATH -notlike "*$nodePath*") {
                $env:PATH += ";$nodePath"
                [Environment]::SetEnvironmentVariable("PATH", $env:PATH, [EnvironmentVariableTarget]::User)
            }
            
            Write-Log "✓ Node.js 설치 완료" "SUCCESS"
        } catch {
            Write-Log "Node.js 설치 실패: $($_.Exception.Message)" "ERROR"
            return $false
        }
    }
    return $true
}

function Install-Redis {
    if (-not $SkipRedis) {
        Write-Log "Redis 설치 중..." "INFO"
        Show-Progress "Redis 설치" "Redis Windows 포트 설치 중..." 75
        
        try {
            $redisUrl = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
            $redisZip = "$env:TEMP\Redis-x64-5.0.14.1.zip"
            $redisPath = "C:\Redis"
            
            # Redis 다운로드
            Write-Log "Redis 다운로드 중..."
            Invoke-WebRequest -Uri $redisUrl -OutFile $redisZip
            
            # 압축 해제
            Write-Log "Redis 압축 해제 중..."
            if (Test-Path $redisPath) {
                Remove-Item $redisPath -Recurse -Force
            }
            Expand-Archive -Path $redisZip -DestinationPath $redisPath -Force
            Remove-Item $redisZip
            
            # PATH에 Redis 추가
            if ($env:PATH -notlike "*$redisPath*") {
                $env:PATH += ";$redisPath"
                [Environment]::SetEnvironmentVariable("PATH", $env:PATH, [EnvironmentVariableTarget]::User)
            }
            
            Write-Log "✓ Redis 설치 완료" "SUCCESS"
        } catch {
            Write-Log "Redis 설치 실패: $($_.Exception.Message)" "ERROR"
            return $false
        }
    }
    return $true
}

function Start-Services {
    Write-Log "서비스 시작 중..." "INFO"
    Show-Progress "서비스 시작" "필요한 서비스들을 시작하는 중..." 85
    
    # PostgreSQL 서비스 시작
    if (-not $SkipPostgreSQL) {
        try {
            $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($pgService -and $pgService.Status -ne 'Running') {
                Start-Service $pgService.Name
                Write-Log "✓ PostgreSQL 서비스 시작됨" "SUCCESS"
            }
        } catch {
            Write-Log "PostgreSQL 서비스 시작 실패: $($_.Exception.Message)" "WARNING"
        }
    }
    
    # Redis 서버 시작
    if (-not $SkipRedis -and (Test-Path "C:\Redis\redis-server.exe")) {
        try {
            $redisProcess = Get-Process redis-server -ErrorAction SilentlyContinue
            if (-not $redisProcess) {
                Start-Process -FilePath "C:\Redis\redis-server.exe" -ArgumentList "C:\Redis\redis.windows.conf" -WindowStyle Minimized
                Start-Sleep -Seconds 3
                Write-Log "✓ Redis 서버 시작됨" "SUCCESS"
            }
        } catch {
            Write-Log "Redis 서버 시작 실패: $($_.Exception.Message)" "WARNING"
        }
    }
}

function Test-Installation {
    Write-Log "설치 검증 중..." "INFO"
    Show-Progress "검증" "설치된 구성 요소들을 검증하는 중..." 95
    
    $results = @{}
    
    # Java 검증
    if (Test-Command "java") {
        try {
            $javaVersion = java -version 2>&1 | Select-Object -First 1
            $results["Java"] = "✓ $javaVersion"
        } catch {
            $results["Java"] = "✗ Java 명령어 실행 실패"
        }
    } else {
        $results["Java"] = "✗ Java 명령어를 찾을 수 없음"
    }
    
    # Maven 검증
    if (Test-Command "mvn") {
        try {
            $mavenVersion = mvn -version | Select-Object -First 1
            $results["Maven"] = "✓ $mavenVersion"
        } catch {
            $results["Maven"] = "✗ Maven 명령어 실행 실패"
        }
    } else {
        $results["Maven"] = "✗ Maven 명령어를 찾을 수 없음"
    }
    
    # Node.js 검증
    if (-not $SkipNodejs) {
        if (Test-Command "node") {
            try {
                $nodeVersion = node --version
                $npmVersion = npm --version
                $results["Node.js"] = "✓ Node.js $nodeVersion, NPM $npmVersion"
            } catch {
                $results["Node.js"] = "✗ Node.js 명령어 실행 실패"
            }
        } else {
            $results["Node.js"] = "✗ Node.js 명령어를 찾을 수 없음"
        }
    }
    
    # PostgreSQL 검증
    if (-not $SkipPostgreSQL) {
        $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pgService) {
            $results["PostgreSQL"] = "✓ 서비스 상태: $($pgService.Status)"
        } else {
            $results["PostgreSQL"] = "✗ PostgreSQL 서비스를 찾을 수 없음"
        }
    }
    
    # Redis 검증
    if (-not $SkipRedis) {
        if (Test-Command "redis-cli") {
            try {
                $redisPing = redis-cli ping 2>$null
                if ($redisPing -eq "PONG") {
                    $redisVersion = redis-cli info server | Select-String "redis_version" | ForEach-Object { $_.ToString().Trim() }
                    $results["Redis"] = "✓ 연결 성공, $redisVersion"
                } else {
                    $results["Redis"] = "✗ Redis 서버에 연결할 수 없음"
                }
            } catch {
                $results["Redis"] = "✗ Redis 연결 테스트 실패"
            }
        } else {
            $results["Redis"] = "✗ Redis CLI를 찾을 수 없음"
        }
    }
    
    # Git 검증
    if (Test-Command "git") {
        try {
            $gitVersion = git --version
            $results["Git"] = "✓ $gitVersion"
        } catch {
            $results["Git"] = "✗ Git 명령어 실행 실패"
        }
    } else {
        $results["Git"] = "✗ Git 명령어를 찾을 수 없음"
    }
    
    # 환경변수 검증
    $envResults = @()
    if ($env:JAVA_HOME) {
        $envResults += "JAVA_HOME: $env:JAVA_HOME"
    }
    if ($env:PATH -like "*nodejs*") {
        $envResults += "PATH에 Node.js 포함됨"
    }
    if ($env:PATH -like "*Redis*") {
        $envResults += "PATH에 Redis 포함됨"
    }
    
    if ($envResults.Count -gt 0) {
        $results["환경변수"] = "✓ " + ($envResults -join ", ")
    }
    
    return $results
}

# 메인 실행 로직
function Main {
    Write-Log "=== Windows 개발환경 자동 구성 스크립트 시작 ===" "INFO"
    Write-Log "시작 시간: $StartTime"
    
    # 관리자 권한 확인
    if (-not (Test-Administrator)) {
        Write-Log "이 스크립트는 관리자 권한이 필요합니다." "ERROR"
        Write-Log "PowerShell을 관리자 권한으로 다시 실행해주세요." "ERROR"
        exit 1
    }
    
    Write-Host ""
    Write-Host "=== Windows 개발환경 자동 구성 스크립트 ===" -ForegroundColor Green
    Write-Host "설치 항목:" -ForegroundColor Yellow
    if (-not $SkipChocolatey) { Write-Host "  - Chocolatey 패키지 매니저" }
    if (-not $SkipJava) { Write-Host "  - Java 21 (OpenJDK)" }
    Write-Host "  - Maven 빌드 도구"
    Write-Host "  - Git 버전 관리"
    if (-not $SkipNodejs) { Write-Host "  - Node.js & NPM" }
    if (-not $SkipPostgreSQL) { Write-Host "  - PostgreSQL 데이터베이스" }
    if (-not $SkipRedis) { Write-Host "  - Redis 캐시 서버" }
    Write-Host ""
    
    $confirmation = Read-Host "계속하시겠습니까? (y/N)"
    if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
        Write-Log "사용자에 의해 설치가 취소되었습니다." "INFO"
        exit 0
    }
    
    # 설치 단계 실행
    $success = $true
    
    $success = $success -and (Install-Chocolatey)
    $success = $success -and (Install-Java)
    $success = $success -and (Install-Maven)
    $success = $success -and (Install-Git)
    $success = $success -and (Install-Nodejs)
    $success = $success -and (Install-PostgreSQL)
    $success = $success -and (Install-Redis)
    
    if ($success) {
        Start-Services
    }
    
    Show-Progress "완료" "설치 완료" 100
    
    # 검증 실행
    if ($Verify -or $success) {
        Write-Host ""
        Write-Host "=== 설치 결과 검증 ===" -ForegroundColor Green
        $testResults = Test-Installation
        
        foreach ($component in $testResults.Keys) {
            if ($testResults[$component] -like "✓*") {
                Write-Host "$component : $($testResults[$component])" -ForegroundColor Green
            } else {
                Write-Host "$component : $($testResults[$component])" -ForegroundColor Red
            }
        }
    }
    
    # 완료 메시지
    $endTime = Get-Date
    $duration = $endTime - $StartTime
    
    Write-Host ""
    Write-Host "=== 설치 완료 ===" -ForegroundColor Green
    Write-Host "소요 시간: $($duration.Minutes)분 $($duration.Seconds)초" -ForegroundColor Gray
    Write-Host "로그 파일: $LogFile" -ForegroundColor Gray
    
    if ($success) {
        Write-Host ""
        Write-Host "다음 단계:" -ForegroundColor Yellow
        Write-Host "1. PowerShell을 재시작하여 환경변수를 새로고침하세요." -ForegroundColor White
        Write-Host "2. 'refreshenv' 명령어로 환경변수를 즉시 적용할 수도 있습니다." -ForegroundColor White
        Write-Host "3. 개발 프로젝트를 시작하세요!" -ForegroundColor White
        
        Write-Log "설치가 성공적으로 완료되었습니다." "SUCCESS"
    } else {
        Write-Host "일부 구성 요소 설치에 실패했습니다. 로그를 확인하세요." -ForegroundColor Red
        Write-Log "설치 중 오류가 발생했습니다." "ERROR"
    }
    
    Write-Log "스크립트 종료 시간: $endTime"
    Write-Log "=== 스크립트 실행 완료 ==="
}

# 스크립트 실행
try {
    Main
} catch {
    Write-Log "치명적 오류 발생: $($_.Exception.Message)" "ERROR"
    Write-Host "오류가 발생했습니다. 로그 파일을 확인하세요: $LogFile" -ForegroundColor Red
    exit 1
} finally {
    Write-Progress -Activity "완료" -Completed
}