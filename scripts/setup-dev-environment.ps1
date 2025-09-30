# ====================================================
# ROIPLATFORM V2 - 개발 환경 자동 설정 스크립트
# Windows 환경 변수 및 PATH 자동 설정
# ====================================================

param(
    [switch]$Force,
    [switch]$SkipNodejs,
    [switch]$SkipJava,
    [switch]$Verbose
)

# 관리자 권한 확인
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 컬러 출력 함수
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    
    switch ($Color) {
        "Red"     { Write-Host $Message -ForegroundColor Red }
        "Green"   { Write-Host $Message -ForegroundColor Green }
        "Yellow"  { Write-Host $Message -ForegroundColor Yellow }
        "Cyan"    { Write-Host $Message -ForegroundColor Cyan }
        "Magenta" { Write-Host $Message -ForegroundColor Magenta }
        "Gray"    { Write-Host $Message -ForegroundColor Gray }
        default   { Write-Host $Message -ForegroundColor White }
    }
}

# 헤더 출력
function Show-Header {
    Write-ColorOutput "=============================================" "Cyan"
    Write-ColorOutput "🔧 ROIPLATFORM V2 - Environment Setup" "Cyan"
    Write-ColorOutput "Windows Development Environment Configurator" "Cyan"
    Write-ColorOutput "=============================================" "Cyan"
    Write-ColorOutput ""
}

# Node.js PATH 설정
function Set-NodejsPath {
    if ($SkipNodejs) {
        Write-ColorOutput "⏭️  Skipping Node.js PATH setup" "Yellow"
        return
    }
    
    Write-ColorOutput "1️⃣ Node.js PATH 설정..." "Yellow"
    
    $nodejsPath = "C:\Program Files\nodejs"
    
    if (-not (Test-Path $nodejsPath)) {
        Write-ColorOutput "❌ Node.js가 설치되지 않았습니다: $nodejsPath" "Red"
        Write-ColorOutput "   https://nodejs.org/ko/download/ 에서 Node.js LTS 버전을 다운로드하여 설치하세요." "Gray"
        return $false
    }
    
    # 현재 PATH에서 Node.js 경로 확인
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::Machine)
    if ($currentPath -like "*$nodejsPath*") {
        Write-ColorOutput "ℹ️  Node.js PATH가 이미 설정되어 있습니다." "Gray"
    } else {
        if (Test-Administrator -or $Force) {
            try {
                [Environment]::SetEnvironmentVariable("PATH", $currentPath + ";$nodejsPath", [EnvironmentVariableTarget]::Machine)
                Write-ColorOutput "✅ Node.js PATH 영구 설정 완료" "Green"
            } catch {
                Write-ColorOutput "❌ Node.js PATH 영구 설정 실패: $_" "Red"
                Write-ColorOutput "   관리자 권한으로 다시 실행하거나 수동으로 설정하세요." "Yellow"
            }
        } else {
            Write-ColorOutput "⚠️  관리자 권한이 없어 현재 세션에서만 설정합니다." "Yellow"
        }
    }
    
    # 현재 세션에서 PATH 설정
    $env:PATH += ";$nodejsPath"
    
    # 설정 확인
    try {
        $nodeVersion = & "$nodejsPath\node.exe" --version
        $npmVersion = & "$nodejsPath\npm.cmd" --version
        Write-ColorOutput "✅ Node.js: $nodeVersion" "Green"
        Write-ColorOutput "✅ npm: $npmVersion" "Green"
        return $true
    } catch {
        Write-ColorOutput "❌ Node.js 설정 검증 실패: $_" "Red"
        return $false
    }
}

# JAVA_HOME 환경 변수 설정
function Set-JavaHome {
    if ($SkipJava) {
        Write-ColorOutput "⏭️  Skipping JAVA_HOME setup" "Yellow"
        return
    }
    
    Write-ColorOutput "2️⃣ JAVA_HOME 환경 변수 설정..." "Yellow"
    
    # Maven에서 감지한 Java 경로 확인
    try {
        $mavenOutput = mvn --version 2>&1
        $javaHomeLine = $mavenOutput | Select-String "runtime:"
        if ($javaHomeLine) {
            $javaPath = ($javaHomeLine -split "runtime: ")[1].Trim()
        } else {
            # 대체 경로들 확인
            $possiblePaths = @(
                "C:\java\jdk-21.0.4.7-hotspot",
                "C:\Program Files\Java\jdk-21",
                "C:\Program Files\Microsoft\jdk-21.0.4.7-hotspot",
                "C:\Program Files\OpenJDK\jdk-21.0.4.7-hotspot"
            )
            
            $javaPath = $null
            foreach ($path in $possiblePaths) {
                if (Test-Path $path) {
                    $javaPath = $path
                    break
                }
            }
        }
    } catch {
        Write-ColorOutput "⚠️  Maven을 통한 Java 경로 감지 실패" "Yellow"
        $javaPath = $null
    }
    
    if (-not $javaPath -or -not (Test-Path $javaPath)) {
        Write-ColorOutput "❌ Java 설치 경로를 찾을 수 없습니다." "Red"
        Write-ColorOutput "   OpenJDK 21을 수동으로 설치하고 경로를 확인하세요." "Gray"
        return $false
    }
    
    # 현재 JAVA_HOME 확인
    $currentJavaHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", [EnvironmentVariableTarget]::Machine)
    if ($currentJavaHome -eq $javaPath) {
        Write-ColorOutput "ℹ️  JAVA_HOME이 이미 올바르게 설정되어 있습니다: $javaPath" "Gray"
    } else {
        if (Test-Administrator -or $Force) {
            try {
                [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaPath, [EnvironmentVariableTarget]::Machine)
                Write-ColorOutput "✅ JAVA_HOME 영구 설정 완료: $javaPath" "Green"
            } catch {
                Write-ColorOutput "❌ JAVA_HOME 영구 설정 실패: $_" "Red"
                Write-ColorOutput "   관리자 권한으로 다시 실행하거나 수동으로 설정하세요." "Yellow"
            }
        } else {
            Write-ColorOutput "⚠️  관리자 권한이 없어 현재 세션에서만 설정합니다." "Yellow"
        }
    }
    
    # 현재 세션에서 JAVA_HOME 설정
    $env:JAVA_HOME = $javaPath
    
    # 설정 확인
    try {
        $javaVersion = java --version | Select-Object -First 1
        Write-ColorOutput "✅ JAVA_HOME: $env:JAVA_HOME" "Green"
        Write-ColorOutput "✅ $javaVersion" "Green"
        return $true
    } catch {
        Write-ColorOutput "❌ Java 설정 검증 실패: $_" "Red"
        return $false
    }
}

# PostgreSQL 연결 테스트
function Test-PostgreSQL {
    Write-ColorOutput "3️⃣ PostgreSQL 연결 테스트..." "Yellow"
    
    try {
        $pgVersion = psql --version
        Write-ColorOutput "✅ $pgVersion" "Green"
        
        # 서비스 상태 확인
        $pgService = Get-Service postgresql* -ErrorAction SilentlyContinue
        if ($pgService -and $pgService.Status -eq "Running") {
            Write-ColorOutput "✅ PostgreSQL 서비스 실행 중: $($pgService.DisplayName)" "Green"
        } else {
            Write-ColorOutput "⚠️  PostgreSQL 서비스가 실행되지 않고 있습니다." "Yellow"
        }
        
        return $true
    } catch {
        Write-ColorOutput "❌ PostgreSQL 확인 실패: $_" "Red"
        Write-ColorOutput "   PostgreSQL 15+를 설치하고 서비스를 시작하세요." "Gray"
        return $false
    }
}

# Redis/Memurai 상태 확인 및 설치 가이드
function Test-Redis {
    Write-ColorOutput "4️⃣ Redis/Memurai 상태 확인..." "Yellow"
    
    # Memurai 확인
    $memuriService = Get-Service memurai* -ErrorAction SilentlyContinue
    if ($memuriService) {
        Write-ColorOutput "✅ Memurai 서비스 발견: $($memuriService.DisplayName)" "Green"
        try {
            $pingResult = memurai-cli ping 2>&1
            if ($pingResult -eq "PONG") {
                Write-ColorOutput "✅ Memurai 연결 테스트 성공" "Green"
                return $true
            }
        } catch {}
    }
    
    # Redis 확인
    $redisService = Get-Service redis* -ErrorAction SilentlyContinue
    if ($redisService) {
        Write-ColorOutput "✅ Redis 서비스 발견: $($redisService.DisplayName)" "Green"
        try {
            $pingResult = redis-cli ping 2>&1
            if ($pingResult -eq "PONG") {
                Write-ColorOutput "✅ Redis 연결 테스트 성공" "Green"
                return $true
            }
        } catch {}
    }
    
    # Redis/Memurai가 없는 경우
    Write-ColorOutput "❌ Redis/Memurai가 설치되지 않았습니다." "Red"
    Write-ColorOutput ""
    Write-ColorOutput "📋 Redis/Memurai 설치 옵션:" "Cyan"
    Write-ColorOutput "   1. Memurai Developer (권장):" "White"
    Write-ColorOutput "      https://www.memurai.com/get-memurai" "Gray"
    Write-ColorOutput "   2. Chocolatey로 Redis 설치:" "White"
    Write-ColorOutput "      choco install redis-64 -y" "Gray"
    Write-ColorOutput "   3. WSL에서 Redis 실행:" "White"
    Write-ColorOutput "      wsl -d Ubuntu -e sudo apt install redis-server" "Gray"
    Write-ColorOutput ""
    
    return $false
}

# 개발 환경 종합 검증
function Test-Development-Environment {
    Write-ColorOutput "5️⃣ 개발 환경 종합 검증..." "Yellow"
    
    $results = @{
        "Node.js" = $false
        "Java" = $false
        "Maven" = $false
        "PostgreSQL" = $false
        "Redis" = $false
        "Git" = $false
    }
    
    # Node.js 확인
    try {
        $nodeVersion = node --version
        $npmVersion = npm --version
        Write-ColorOutput "✅ Node.js: $nodeVersion (npm: $npmVersion)" "Green"
        $results["Node.js"] = $true
    } catch {
        Write-ColorOutput "❌ Node.js: 설정되지 않음" "Red"
    }
    
    # Java 확인
    try {
        $javaVersion = java --version | Select-Object -First 1
        Write-ColorOutput "✅ Java: $javaVersion" "Green"
        Write-ColorOutput "   JAVA_HOME: $env:JAVA_HOME" "Gray"
        $results["Java"] = $true
    } catch {
        Write-ColorOutput "❌ Java: 설정되지 않음" "Red"
    }
    
    # Maven 확인
    try {
        $mvnVersion = mvn --version | Select-Object -First 1
        Write-ColorOutput "✅ Maven: $mvnVersion" "Green"
        $results["Maven"] = $true
    } catch {
        Write-ColorOutput "❌ Maven: 설정되지 않음" "Red"
    }
    
    # PostgreSQL 확인
    try {
        $pgVersion = psql --version
        Write-ColorOutput "✅ PostgreSQL: $pgVersion" "Green"
        $results["PostgreSQL"] = $true
    } catch {
        Write-ColorOutput "❌ PostgreSQL: 설정되지 않음" "Red"
    }
    
    # Redis 확인
    $redisWorking = $false
    try {
        $pingResult = redis-cli ping 2>&1
        if ($pingResult -eq "PONG") {
            Write-ColorOutput "✅ Redis: 연결 성공" "Green"
            $redisWorking = $true
        }
    } catch {}
    
    if (-not $redisWorking) {
        try {
            $pingResult = memurai-cli ping 2>&1
            if ($pingResult -eq "PONG") {
                Write-ColorOutput "✅ Memurai: 연결 성공" "Green"
                $redisWorking = $true
            }
        } catch {}
    }
    
    if (-not $redisWorking) {
        Write-ColorOutput "❌ Redis/Memurai: 연결 실패" "Red"
    } else {
        $results["Redis"] = $true
    }
    
    # Git 확인
    try {
        $gitVersion = git --version
        Write-ColorOutput "✅ Git: $gitVersion" "Green"
        $results["Git"] = $true
    } catch {
        Write-ColorOutput "❌ Git: 설정되지 않음" "Red"
    }
    
    # 결과 요약
    Write-ColorOutput ""
    Write-ColorOutput "📊 개발 환경 설정 결과:" "Cyan"
    $successCount = 0
    $totalCount = $results.Count
    
    foreach ($tool in $results.Keys) {
        $status = if ($results[$tool]) { "✅" } else { "❌" }
        $color = if ($results[$tool]) { "Green" } else { "Red" }
        Write-ColorOutput "   $status $tool" $color
        if ($results[$tool]) { $successCount++ }
    }
    
    $percentage = [math]::Round(($successCount / $totalCount) * 100)
    Write-ColorOutput ""
    Write-ColorOutput "🎯 전체 완성도: $successCount/$totalCount ($percentage%)" "Cyan"
    
    if ($percentage -ge 80) {
        Write-ColorOutput "🎉 개발 환경이 잘 구성되었습니다!" "Green"
    } elseif ($percentage -ge 60) {
        Write-ColorOutput "⚠️  몇 가지 설정이 더 필요합니다." "Yellow"
    } else {
        Write-ColorOutput "🚨 개발 환경 구성이 불완전합니다." "Red"
    }
    
    return $results
}

# PowerShell 프로파일 설정 제안
function Suggest-PowerShellProfile {
    Write-ColorOutput "6️⃣ PowerShell 프로파일 설정 제안..." "Yellow"
    
    if (-not (Test-Path $PROFILE)) {
        Write-ColorOutput "ℹ️  PowerShell 프로파일이 생성되지 않았습니다." "Gray"
        Write-ColorOutput "   다음 명령으로 자동 환경 변수 로딩 설정을 추가할 수 있습니다:" "Gray"
        Write-ColorOutput ""
        Write-ColorOutput "   New-Item -ItemType File -Path `$PROFILE -Force" "Cyan"
        Write-ColorOutput "   Add-Content `$PROFILE '`$env:PATH += \";C:\\Program Files\\nodejs\"'" "Cyan"
        Write-ColorOutput "   Add-Content `$PROFILE '`$env:JAVA_HOME = \"C:\\java\\jdk-21.0.4.7-hotspot\"'" "Cyan"
        Write-ColorOutput ""
    } else {
        Write-ColorOutput "✅ PowerShell 프로파일 존재: $PROFILE" "Green"
    }
}

# 메인 실행 함수
function Main {
    Show-Header
    
    # 관리자 권한 확인 및 안내
    if (Test-Administrator) {
        Write-ColorOutput "🔑 관리자 권한으로 실행 중 - 영구 설정이 적용됩니다." "Green"
    } else {
        Write-ColorOutput "⚠️  관리자 권한이 아님 - 현재 세션에서만 설정됩니다." "Yellow"
        Write-ColorOutput "   영구 설정을 위해서는 관리자 권한으로 실행하세요." "Gray"
    }
    
    Write-ColorOutput ""
    Write-ColorOutput "🚀 ROIPLATFORM 개발 환경 자동 설정을 시작합니다..." "Cyan"
    Write-ColorOutput ""
    
    # 각 구성 요소 설정
    $nodeSuccess = Set-NodejsPath
    $javaSuccess = Set-JavaHome
    $postgresSuccess = Test-PostgreSQL
    $redisSuccess = Test-Redis
    
    Write-ColorOutput ""
    
    # 종합 검증
    $results = Test-Development-Environment
    
    Write-ColorOutput ""
    
    # PowerShell 프로파일 제안
    Suggest-PowerShellProfile
    
    Write-ColorOutput ""
    Write-ColorOutput "🎯 다음 단계:" "Cyan"
    
    if (-not $results["Redis"]) {
        Write-ColorOutput "   1. Redis/Memurai 설치 (필수)" "Yellow"
        Write-ColorOutput "      - Memurai Developer: https://www.memurai.com/get-memurai" "Gray"
    }
    
    if (-not (Test-Administrator) -and ($nodeSuccess -or $javaSuccess)) {
        Write-ColorOutput "   2. 관리자 권한으로 재실행하여 영구 설정 적용" "Yellow"
    }
    
    Write-ColorOutput "   3. 개발 서비스 시작:" "Yellow"
    Write-ColorOutput "      .\\scripts\\start-all-services.ps1" "Gray"
    
    Write-ColorOutput ""
    Write-ColorOutput "📖 더 자세한 정보는 DEV_SETUP_GUIDE.md를 참조하세요." "Cyan"
}

# 도움말
function Show-Help {
    Write-ColorOutput ""
    Write-ColorOutput "Usage: .\\setup-dev-environment.ps1 [OPTIONS]" "Cyan"
    Write-ColorOutput ""
    Write-ColorOutput "Options:" "Yellow"
    Write-ColorOutput "  -Force                Force setting environment variables without admin" "White"
    Write-ColorOutput "  -SkipNodejs           Skip Node.js PATH setup" "White"
    Write-ColorOutput "  -SkipJava             Skip JAVA_HOME setup" "White"
    Write-ColorOutput "  -Verbose              Enable verbose output" "White"
    Write-ColorOutput "  -h, --help            Show this help message" "White"
    Write-ColorOutput ""
    Write-ColorOutput "Examples:" "Yellow"
    Write-ColorOutput "  .\\setup-dev-environment.ps1" "Gray"
    Write-ColorOutput "  .\\setup-dev-environment.ps1 -Force" "Gray"
    Write-ColorOutput "  .\\setup-dev-environment.ps1 -SkipJava -Verbose" "Gray"
    Write-ColorOutput ""
}

# 도움말 확인
if ($args -contains "-h" -or $args -contains "--help") {
    Show-Help
    exit 0
}

# 스크립트 실행
try {
    Main
} catch {
    Write-ColorOutput "❌ 예기치 않은 오류가 발생했습니다: $_" "Red"
    if ($Verbose) {
        Write-ColorOutput "Stack trace: $($_.ScriptStackTrace)" "Red"
    }
    exit 1
}