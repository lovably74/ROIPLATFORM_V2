<#
.SYNOPSIS
    개발환경 검증 스크립트

.DESCRIPTION
    설치된 모든 개발 도구들의 상태를 종합적으로 검증하고
    상세한 결과 보고서를 생성하는 스크립트입니다.

.PARAMETER CreateReport
    검증 결과를 MD 파일로 저장합니다.

.PARAMETER CheckServices
    서비스 상태도 함께 확인합니다.

.EXAMPLE
    .\verify-development-environment.ps1
    기본 검증을 수행합니다.

.EXAMPLE
    .\verify-development-environment.ps1 -CreateReport -CheckServices
    서비스 상태를 포함한 전체 검증을 수행하고 보고서를 생성합니다.

.NOTES
    작성자: Development Team
    작성일: 2025-09-30
    버전: 1.0
#>

param(
    [switch]$CreateReport,
    [switch]$CheckServices
)

# 전역 변수
$ReportFile = "dev-environment-verification-report.md"
$StartTime = Get-Date

# 검증 결과를 저장할 객체
$VerificationResults = @{
    "Java" = @{}
    "Maven" = @{}
    "NodeJS" = @{}
    "PostgreSQL" = @{}
    "Redis" = @{}
    "Git" = @{}
    "EnvironmentVariables" = @{}
    "Services" = @{}
    "Summary" = @{}
}

# 유틸리티 함수들
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction SilentlyContinue | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-Service {
    param([string]$ServiceName)
    try {
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        return $service
    } catch {
        return $null
    }
}

function Test-Port {
    param([int]$Port, [string]$Host = "localhost")
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $tcpClient.Connect($Host, $Port)
        $tcpClient.Close()
        return $true
    } catch {
        return $false
    }
}

# 개별 검증 함수들
function Test-JavaInstallation {
    Write-Host "Java 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "IsInstalled" = $false
        "Version" = ""
        "JavaHome" = ""
        "CompilerAvailable" = $false
        "Issues" = @()
    }
    
    # Java 런타임 확인
    if (Test-Command "java") {
        try {
            $javaVersionOutput = java -version 2>&1
            $result.Version = ($javaVersionOutput | Select-Object -First 1).ToString()
            $result.IsInstalled = $true
            
            if ($result.Version -like "*21*") {
                Write-Host "  ✓ Java 21이 설치되어 있습니다." -ForegroundColor Green
            } else {
                Write-Host "  ⚠ Java 21이 아닌 다른 버전이 설치되어 있습니다." -ForegroundColor Yellow
                $result.Issues += "권장 버전(Java 21)이 아닙니다."
            }
        } catch {
            $result.Issues += "Java 버전 확인 실패"
        }
    } else {
        Write-Host "  ✗ Java가 설치되지 않았습니다." -ForegroundColor Red
        $result.Issues += "Java 명령어를 찾을 수 없습니다."
    }
    
    # Java 컴파일러 확인
    if (Test-Command "javac") {
        $result.CompilerAvailable = $true
        Write-Host "  ✓ Java 컴파일러가 사용 가능합니다." -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Java 컴파일러를 찾을 수 없습니다." -ForegroundColor Yellow
        $result.Issues += "javac 명령어를 찾을 수 없습니다."
    }
    
    # JAVA_HOME 확인
    if ($env:JAVA_HOME) {
        $result.JavaHome = $env:JAVA_HOME
        if (Test-Path $env:JAVA_HOME) {
            Write-Host "  ✓ JAVA_HOME이 올바르게 설정되어 있습니다: $($env:JAVA_HOME)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ JAVA_HOME 경로가 존재하지 않습니다: $($env:JAVA_HOME)" -ForegroundColor Red
            $result.Issues += "JAVA_HOME 경로가 유효하지 않습니다."
        }
    } else {
        Write-Host "  ⚠ JAVA_HOME 환경변수가 설정되지 않았습니다." -ForegroundColor Yellow
        $result.Issues += "JAVA_HOME 환경변수가 설정되지 않았습니다."
    }
    
    $VerificationResults.Java = $result
}

function Test-MavenInstallation {
    Write-Host "Maven 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "IsInstalled" = $false
        "Version" = ""
        "JavaIntegration" = $false
        "Issues" = @()
    }
    
    if (Test-Command "mvn") {
        try {
            $mavenVersionOutput = mvn -version
            $result.Version = ($mavenVersionOutput | Select-Object -First 1).ToString()
            $result.IsInstalled = $true
            
            # Maven이 올바른 Java 버전을 사용하는지 확인
            $javaVersionLine = $mavenVersionOutput | Where-Object { $_ -like "*Java version*" }
            if ($javaVersionLine -and $javaVersionLine -like "*21*") {
                $result.JavaIntegration = $true
                Write-Host "  ✓ Maven이 Java 21과 올바르게 연동되어 있습니다." -ForegroundColor Green
            } else {
                Write-Host "  ⚠ Maven이 권장 Java 버전과 연동되지 않았을 수 있습니다." -ForegroundColor Yellow
                $result.Issues += "Maven의 Java 버전 연동 확인이 필요합니다."
            }
            
            Write-Host "  ✓ Maven이 정상적으로 설치되어 있습니다." -ForegroundColor Green
        } catch {
            $result.Issues += "Maven 버전 확인 실패"
        }
    } else {
        Write-Host "  ✗ Maven이 설치되지 않았습니다." -ForegroundColor Red
        $result.Issues += "mvn 명령어를 찾을 수 없습니다."
    }
    
    $VerificationResults.Maven = $result
}

function Test-NodeJSInstallation {
    Write-Host "Node.js 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "IsInstalled" = $false
        "NodeVersion" = ""
        "NpmVersion" = ""
        "Issues" = @()
    }
    
    # Node.js 확인
    if (Test-Command "node") {
        try {
            $result.NodeVersion = node --version
            $result.IsInstalled = $true
            
            if ($result.NodeVersion -like "v22*" -or $result.NodeVersion -like "v20*" -or $result.NodeVersion -like "v18*") {
                Write-Host "  ✓ Node.js LTS 버전이 설치되어 있습니다: $($result.NodeVersion)" -ForegroundColor Green
            } else {
                Write-Host "  ⚠ Node.js 버전 확인이 필요합니다: $($result.NodeVersion)" -ForegroundColor Yellow
                $result.Issues += "권장 LTS 버전이 아닐 수 있습니다."
            }
        } catch {
            $result.Issues += "Node.js 버전 확인 실패"
        }
    } else {
        Write-Host "  ✗ Node.js가 설치되지 않았습니다." -ForegroundColor Red
        $result.Issues += "node 명령어를 찾을 수 없습니다."
    }
    
    # NPM 확인
    if (Test-Command "npm") {
        try {
            $result.NpmVersion = npm --version
            Write-Host "  ✓ NPM이 사용 가능합니다: v$($result.NpmVersion)" -ForegroundColor Green
        } catch {
            $result.Issues += "NPM 버전 확인 실패"
        }
    } else {
        Write-Host "  ⚠ NPM을 찾을 수 없습니다." -ForegroundColor Yellow
        $result.Issues += "npm 명령어를 찾을 수 없습니다."
    }
    
    $VerificationResults.NodeJS = $result
}

function Test-PostgreSQLInstallation {
    Write-Host "PostgreSQL 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "IsInstalled" = $false
        "ServiceStatus" = ""
        "Port" = 5432
        "IsListening" = $false
        "Version" = ""
        "Issues" = @()
    }
    
    # PostgreSQL 서비스 확인
    $pgService = Test-Service "postgresql*"
    if ($pgService) {
        $result.IsInstalled = $true
        $result.ServiceStatus = $pgService.Status
        
        if ($pgService.Status -eq "Running") {
            Write-Host "  ✓ PostgreSQL 서비스가 실행 중입니다." -ForegroundColor Green
            
            # 포트 확인
            if (Test-Port -Port 5432) {
                $result.IsListening = $true
                Write-Host "  ✓ PostgreSQL이 포트 5432에서 대기 중입니다." -ForegroundColor Green
            } else {
                Write-Host "  ⚠ PostgreSQL 포트 5432에 연결할 수 없습니다." -ForegroundColor Yellow
                $result.Issues += "포트 5432 연결 실패"
            }
        } else {
            Write-Host "  ⚠ PostgreSQL 서비스가 중지되어 있습니다." -ForegroundColor Yellow
            $result.Issues += "서비스가 실행되지 않고 있습니다."
        }
    } else {
        Write-Host "  ✗ PostgreSQL 서비스를 찾을 수 없습니다." -ForegroundColor Red
        $result.Issues += "PostgreSQL 서비스가 설치되지 않았습니다."
    }
    
    # psql 명령어 확인
    if (Test-Command "psql") {
        try {
            $psqlVersion = psql --version
            $result.Version = $psqlVersion
            Write-Host "  ✓ psql 클라이언트가 사용 가능합니다." -ForegroundColor Green
        } catch {
            $result.Issues += "psql 버전 확인 실패"
        }
    }
    
    $VerificationResults.PostgreSQL = $result
}

function Test-RedisInstallation {
    Write-Host "Redis 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "IsInstalled" = $false
        "IsRunning" = $false
        "Port" = 6379
        "Version" = ""
        "Issues" = @()
    }
    
    # Redis CLI 확인
    if (Test-Command "redis-cli") {
        $result.IsInstalled = $true
        Write-Host "  ✓ Redis CLI가 설치되어 있습니다." -ForegroundColor Green
        
        try {
            # Redis 서버 연결 테스트
            $pingResult = redis-cli ping 2>$null
            if ($pingResult -eq "PONG") {
                $result.IsRunning = $true
                Write-Host "  ✓ Redis 서버가 실행 중입니다." -ForegroundColor Green
                
                # Redis 버전 확인
                $versionInfo = redis-cli info server | Select-String "redis_version"
                if ($versionInfo) {
                    $result.Version = $versionInfo.ToString().Trim()
                    Write-Host "  ✓ $($result.Version)" -ForegroundColor Green
                }
                
                # 포트 확인
                if (Test-Port -Port 6379) {
                    Write-Host "  ✓ Redis가 포트 6379에서 대기 중입니다." -ForegroundColor Green
                }
            } else {
                Write-Host "  ✗ Redis 서버에 연결할 수 없습니다." -ForegroundColor Red
                $result.Issues += "Redis 서버가 실행되지 않고 있습니다."
            }
        } catch {
            Write-Host "  ✗ Redis 연결 테스트 실패." -ForegroundColor Red
            $result.Issues += "Redis 연결 테스트 중 오류 발생"
        }
    } else {
        Write-Host "  ✗ Redis CLI가 설치되지 않았습니다." -ForegroundColor Red
        $result.Issues += "redis-cli 명령어를 찾을 수 없습니다."
    }
    
    $VerificationResults.Redis = $result
}

function Test-GitInstallation {
    Write-Host "Git 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "IsInstalled" = $false
        "Version" = ""
        "ConfigCheck" = $false
        "Issues" = @()
    }
    
    if (Test-Command "git") {
        try {
            $result.Version = git --version
            $result.IsInstalled = $true
            Write-Host "  ✓ Git이 설치되어 있습니다: $($result.Version)" -ForegroundColor Green
            
            # Git 기본 설정 확인
            $userName = git config --global user.name 2>$null
            $userEmail = git config --global user.email 2>$null
            
            if ($userName -and $userEmail) {
                $result.ConfigCheck = $true
                Write-Host "  ✓ Git 사용자 정보가 설정되어 있습니다." -ForegroundColor Green
            } else {
                Write-Host "  ⚠ Git 사용자 정보가 설정되지 않았습니다." -ForegroundColor Yellow
                $result.Issues += "git config --global user.name 및 user.email 설정이 필요합니다."
            }
        } catch {
            $result.Issues += "Git 버전 확인 실패"
        }
    } else {
        Write-Host "  ✗ Git이 설치되지 않았습니다." -ForegroundColor Red
        $result.Issues += "git 명령어를 찾을 수 없습니다."
    }
    
    $VerificationResults.Git = $result
}

function Test-EnvironmentVariables {
    Write-Host "환경변수 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "JavaHome" = @{ "IsSet" = $false, "Value" = "", "IsValid" = $false }
        "Path" = @{ "NodeJS" = $false, "Redis" = $false, "Java" = $false }
        "Issues" = @()
    }
    
    # JAVA_HOME 확인
    if ($env:JAVA_HOME) {
        $result.JavaHome.IsSet = $true
        $result.JavaHome.Value = $env:JAVA_HOME
        
        if (Test-Path $env:JAVA_HOME) {
            $result.JavaHome.IsValid = $true
            Write-Host "  ✓ JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Green
        } else {
            Write-Host "  ✗ JAVA_HOME 경로가 유효하지 않습니다: $env:JAVA_HOME" -ForegroundColor Red
            $result.Issues += "JAVA_HOME 경로가 존재하지 않습니다."
        }
    } else {
        Write-Host "  ⚠ JAVA_HOME이 설정되지 않았습니다." -ForegroundColor Yellow
        $result.Issues += "JAVA_HOME 환경변수 설정이 필요합니다."
    }
    
    # PATH 확인
    $pathItems = $env:PATH -split ';'
    
    if ($pathItems | Where-Object { $_ -like "*nodejs*" }) {
        $result.Path.NodeJS = $true
        Write-Host "  ✓ PATH에 Node.js가 포함되어 있습니다." -ForegroundColor Green
    }
    
    if ($pathItems | Where-Object { $_ -like "*Redis*" }) {
        $result.Path.Redis = $true
        Write-Host "  ✓ PATH에 Redis가 포함되어 있습니다." -ForegroundColor Green
    }
    
    if ($pathItems | Where-Object { $_ -like "*java*" -or $_ -like "*jdk*" }) {
        $result.Path.Java = $true
        Write-Host "  ✓ PATH에 Java가 포함되어 있습니다." -ForegroundColor Green
    }
    
    $VerificationResults.EnvironmentVariables = $result
}

function Test-Services {
    if (-not $CheckServices) { return }
    
    Write-Host "서비스 상태 검증 중..." -ForegroundColor Yellow
    
    $result = @{
        "PostgreSQL" = @{}
        "Other" = @{}
    }
    
    # PostgreSQL 서비스 상세 확인
    $pgServices = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    foreach ($service in $pgServices) {
        $serviceInfo = @{
            "Name" = $service.Name
            "Status" = $service.Status
            "StartType" = $service.StartType
        }
        $result.PostgreSQL[$service.Name] = $serviceInfo
        
        $statusColor = if ($service.Status -eq "Running") { "Green" } else { "Yellow" }
        Write-Host "  $($service.Name): $($service.Status) ($($service.StartType))" -ForegroundColor $statusColor
    }
    
    $VerificationResults.Services = $result
}

function Create-VerificationReport {
    if (-not $CreateReport) { return }
    
    Write-Host "검증 보고서 생성 중..." -ForegroundColor Yellow
    
    $reportContent = @"
# 개발환경 검증 보고서

> **검증 일시**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")  
> **시스템**: $env:COMPUTERNAME  
> **사용자**: $env:USERNAME  

## 📊 검증 요약

"@

    # 요약 섹션 생성
    $totalComponents = 6
    $passedComponents = 0
    
    if ($VerificationResults.Java.IsInstalled) { $passedComponents++ }
    if ($VerificationResults.Maven.IsInstalled) { $passedComponents++ }
    if ($VerificationResults.NodeJS.IsInstalled) { $passedComponents++ }
    if ($VerificationResults.PostgreSQL.IsInstalled) { $passedComponents++ }
    if ($VerificationResults.Redis.IsInstalled) { $passedComponents++ }
    if ($VerificationResults.Git.IsInstalled) { $passedComponents++ }
    
    $reportContent += @"

- **전체 구성 요소**: $totalComponents개
- **정상 설치된 구성 요소**: $passedComponents개
- **설치율**: $([math]::Round(($passedComponents / $totalComponents) * 100, 1))%

## 🔍 상세 검증 결과

### Java
- **설치 상태**: $(if($VerificationResults.Java.IsInstalled) { "✅ 설치됨" } else { "❌ 미설치" })
- **버전**: $($VerificationResults.Java.Version)
- **JAVA_HOME**: $($VerificationResults.Java.JavaHome)
- **컴파일러**: $(if($VerificationResults.Java.CompilerAvailable) { "✅ 사용 가능" } else { "❌ 사용 불가" })

### Maven
- **설치 상태**: $(if($VerificationResults.Maven.IsInstalled) { "✅ 설치됨" } else { "❌ 미설치" })
- **버전**: $($VerificationResults.Maven.Version)
- **Java 연동**: $(if($VerificationResults.Maven.JavaIntegration) { "✅ 정상" } else { "⚠️ 확인 필요" })

### Node.js
- **설치 상태**: $(if($VerificationResults.NodeJS.IsInstalled) { "✅ 설치됨" } else { "❌ 미설치" })
- **Node.js 버전**: $($VerificationResults.NodeJS.NodeVersion)
- **NPM 버전**: $($VerificationResults.NodeJS.NpmVersion)

### PostgreSQL
- **설치 상태**: $(if($VerificationResults.PostgreSQL.IsInstalled) { "✅ 설치됨" } else { "❌ 미설치" })
- **서비스 상태**: $($VerificationResults.PostgreSQL.ServiceStatus)
- **포트 5432 대기**: $(if($VerificationResults.PostgreSQL.IsListening) { "✅ 정상" } else { "❌ 연결 불가" })
- **버전**: $($VerificationResults.PostgreSQL.Version)

### Redis
- **설치 상태**: $(if($VerificationResults.Redis.IsInstalled) { "✅ 설치됨" } else { "❌ 미설치" })
- **실행 상태**: $(if($VerificationResults.Redis.IsRunning) { "✅ 실행 중" } else { "❌ 중지됨" })
- **버전**: $($VerificationResults.Redis.Version)

### Git
- **설치 상태**: $(if($VerificationResults.Git.IsInstalled) { "✅ 설치됨" } else { "❌ 미설치" })
- **버전**: $($VerificationResults.Git.Version)
- **사용자 설정**: $(if($VerificationResults.Git.ConfigCheck) { "✅ 완료" } else { "⚠️ 미설정" })

### 환경변수
- **JAVA_HOME**: $(if($VerificationResults.EnvironmentVariables.JavaHome.IsSet) { "✅ 설정됨" } else { "❌ 미설정" })
- **PATH 포함 항목**:
  - Node.js: $(if($VerificationResults.EnvironmentVariables.Path.NodeJS) { "✅" } else { "❌" })
  - Redis: $(if($VerificationResults.EnvironmentVariables.Path.Redis) { "✅" } else { "❌" })
  - Java: $(if($VerificationResults.EnvironmentVariables.Path.Java) { "✅" } else { "❌" })

## 🚨 발견된 문제점

"@

    # 문제점 수집
    $allIssues = @()
    foreach ($component in $VerificationResults.Keys) {
        if ($VerificationResults[$component].Issues) {
            foreach ($issue in $VerificationResults[$component].Issues) {
                $allIssues += "- **$component**: $issue"
            }
        }
    }
    
    if ($allIssues.Count -eq 0) {
        $reportContent += "`n✅ 발견된 문제점이 없습니다!`n"
    } else {
        $reportContent += "`n" + ($allIssues -join "`n") + "`n"
    }
    
    $reportContent += @"

## 💡 권장 조치사항

$(if ($passedComponents -eq $totalComponents) {
    "🎉 모든 구성 요소가 정상적으로 설치되고 설정되었습니다! 개발을 시작할 수 있습니다."
} else {
    "다음 조치를 취하여 개발환경을 완성하세요:"
    $recommendations = @()
    
    if (-not $VerificationResults.Java.IsInstalled) { 
        $recommendations += "- Java 21 설치: ``choco install openjdk21 -y``" 
    }
    if (-not $VerificationResults.Maven.IsInstalled) { 
        $recommendations += "- Maven 설치: ``choco install maven -y``" 
    }
    if (-not $VerificationResults.NodeJS.IsInstalled) { 
        $recommendations += "- Node.js 설치: ``choco install nodejs -y``" 
    }
    if (-not $VerificationResults.PostgreSQL.IsInstalled) { 
        $recommendations += "- PostgreSQL 설치: ``choco install postgresql -y``" 
    }
    if (-not $VerificationResults.Redis.IsInstalled) { 
        $recommendations += "- Redis 설치: Windows Redis 포트 다운로드 및 설치" 
    }
    if (-not $VerificationResults.Git.IsInstalled) { 
        $recommendations += "- Git 설치: ``choco install git -y``" 
    }
    
    if ($recommendations.Count -gt 0) {
        "`n" + ($recommendations -join "`n")
    }
})

---

**생성 도구**: 개발환경 검증 스크립트  
**생성 일시**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

    # 보고서 파일 저장
    $reportContent | Out-File -FilePath $ReportFile -Encoding UTF8
    Write-Host "  ✓ 검증 보고서가 생성되었습니다: $ReportFile" -ForegroundColor Green
}

# 메인 실행 로직
function Main {
    Write-Host ""
    Write-Host "=== 개발환경 검증 스크립트 ===" -ForegroundColor Green
    Write-Host "검증 시작: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")" -ForegroundColor Gray
    Write-Host ""
    
    # 각 구성 요소 검증 실행
    Test-JavaInstallation
    Write-Host ""
    
    Test-MavenInstallation
    Write-Host ""
    
    Test-NodeJSInstallation
    Write-Host ""
    
    Test-PostgreSQLInstallation
    Write-Host ""
    
    Test-RedisInstallation
    Write-Host ""
    
    Test-GitInstallation
    Write-Host ""
    
    Test-EnvironmentVariables
    Write-Host ""
    
    if ($CheckServices) {
        Test-Services
        Write-Host ""
    }
    
    # 보고서 생성
    Create-VerificationReport
    
    # 최종 요약
    Write-Host "=== 검증 완료 ===" -ForegroundColor Green
    
    $endTime = Get-Date
    $duration = $endTime - $StartTime
    Write-Host "소요 시간: $($duration.TotalSeconds.ToString("F1"))초" -ForegroundColor Gray
    
    if ($CreateReport) {
        Write-Host "보고서 위치: $ReportFile" -ForegroundColor Gray
    }
    
    Write-Host ""
    
    # 전체 상태 요약
    $installedCount = 0
    $totalCount = 6
    
    if ($VerificationResults.Java.IsInstalled) { $installedCount++ }
    if ($VerificationResults.Maven.IsInstalled) { $installedCount++ }
    if ($VerificationResults.NodeJS.IsInstalled) { $installedCount++ }
    if ($VerificationResults.PostgreSQL.IsInstalled) { $installedCount++ }
    if ($VerificationResults.Redis.IsInstalled) { $installedCount++ }
    if ($VerificationResults.Git.IsInstalled) { $installedCount++ }
    
    $percentage = ($installedCount / $totalCount) * 100
    
    if ($percentage -eq 100) {
        Write-Host "🎉 축하합니다! 개발환경이 완벽하게 구성되었습니다!" -ForegroundColor Green
    } elseif ($percentage -ge 80) {
        Write-Host "⚠️  개발환경이 거의 완성되었습니다. ($installedCount/$totalCount 설치됨)" -ForegroundColor Yellow
        Write-Host "   일부 구성 요소의 설치나 설정을 완료하면 개발을 시작할 수 있습니다." -ForegroundColor Yellow
    } else {
        Write-Host "❌ 개발환경 설정이 불완전합니다. ($installedCount/$totalCount 설치됨)" -ForegroundColor Red
        Write-Host "   setup-development-environment.ps1 스크립트를 실행하여 자동 설치를 권장합니다." -ForegroundColor Red
    }
}

# 스크립트 실행
try {
    Main
} catch {
    Write-Host "검증 중 오류 발생: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}