# ====================================================
# ROIPLATFORM V2 - 개발 서비스 시작 스크립트
# Windows Native Process 실행 (Docker 사용하지 않음)
# ====================================================

param(
    [string]$Profile = "dev",
    [switch]$SkipFrontend,
    [switch]$SkipGateway,
    [switch]$Verbose
)

# 컬러 출력 함수
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    
    switch ($Color) {
        "Red"     { Write-Host $Message -ForegroundColor Red }
        "Green"   { Write-Host $Message -ForegroundColor Green }
        "Yellow"  { Write-Host $Message -ForegroundColor Yellow }
        "Cyan"    { Write-Host $Message -ForegroundColor Cyan }
        "Magenta" { Write-Host $Message -ForegroundColor Magenta }
        default   { Write-Host $Message -ForegroundColor White }
    }
}

# 헤더 출력
function Show-Header {
    Write-ColorOutput "=============================================" "Cyan"
    Write-ColorOutput "🌊 ROIPLATFORM V2 - Development Launcher" "Cyan"
    Write-ColorOutput "Ocean Blue & Neumorphism Design System" "Cyan"
    Write-ColorOutput "=============================================" "Cyan"
    Write-ColorOutput ""
}

# 환경 변수 로드
function Load-EnvironmentVariables {
    $envFile = ".env.local"
    if (-not (Test-Path $envFile)) {
        $envFile = ".env.example"
        Write-ColorOutput "⚠️  .env.local not found, using .env.example" "Yellow"
    }
    
    if (Test-Path $envFile) {
        Write-ColorOutput "📄 Loading environment variables from $envFile" "Green"
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
                if ($Verbose) {
                    Write-ColorOutput "   Set $name = $value" "Gray"
                }
            }
        }
    }
}

# 선행 조건 확인
function Test-Prerequisites {
    Write-ColorOutput "🔍 Checking prerequisites..." "Yellow"
    
    $missing = @()
    
    # Java 21 확인
    try {
        $javaVersion = java -version 2>&1 | Select-Object -First 1
        if ($javaVersion -match "openjdk.*21") {
            Write-ColorOutput "✅ Java 21: $javaVersion" "Green"
        } else {
            Write-ColorOutput "❌ Java 21 not found: $javaVersion" "Red"
            $missing += "Java 21"
        }
    } catch {
        Write-ColorOutput "❌ Java not found in PATH" "Red"
        $missing += "Java 21"
    }
    
    # Node.js 20+ 확인
    try {
        $nodeVersion = node --version
        if ([version]$nodeVersion.Substring(1) -ge [version]"20.0.0") {
            Write-ColorOutput "✅ Node.js: $nodeVersion" "Green"
        } else {
            Write-ColorOutput "❌ Node.js 20+ required: $nodeVersion" "Red"
            $missing += "Node.js 20+"
        }
    } catch {
        Write-ColorOutput "❌ Node.js not found in PATH" "Red"
        $missing += "Node.js 20+"
    }
    
    # PostgreSQL 연결 확인
    try {
        $pgResult = psql -U $env:DATABASE_USERNAME -d $env:DATABASE_NAME -h $env:DATABASE_HOST -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ PostgreSQL: Connected to $env:DATABASE_NAME" "Green"
        } else {
            Write-ColorOutput "❌ PostgreSQL connection failed" "Red"
            $missing += "PostgreSQL connection"
        }
    } catch {
        Write-ColorOutput "❌ PostgreSQL psql not found" "Red"
        $missing += "PostgreSQL"
    }
    
    # Redis/Memurai 연결 확인
    try {
        $redisResult = redis-cli -h $env:REDIS_HOST -p $env:REDIS_PORT ping 2>&1
        if ($redisResult -eq "PONG") {
            Write-ColorOutput "✅ Redis/Memurai: Connected" "Green"
        } else {
            Write-ColorOutput "❌ Redis/Memurai connection failed" "Red"
            $missing += "Redis/Memurai"
        }
    } catch {
        Write-ColorOutput "❌ Redis CLI not found" "Red"
        $missing += "Redis/Memurai"
    }
    
    if ($missing.Count -gt 0) {
        Write-ColorOutput "⚠️  Missing prerequisites: $($missing -join ', ')" "Red"
        Write-ColorOutput "Please check DEV_SETUP_GUIDE.md for installation instructions" "Yellow"
        return $false
    }
    
    return $true
}

# 포트 사용 여부 확인
function Test-Port {
    param([int]$Port)
    
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $connection -ne $null
}

# 서비스 시작 함수
function Start-SpringBootService {
    param(
        [string]$ServiceName,
        [string]$ServicePath,
        [int]$Port,
        [string]$Color = "Green"
    )
    
    if (Test-Port $Port) {
        Write-ColorOutput "⚠️  Port $Port already in use, skipping $ServiceName" "Yellow"
        return
    }
    
    if (-not (Test-Path $ServicePath)) {
        Write-ColorOutput "❌ Service directory not found: $ServicePath" "Red"
        return
    }
    
    Write-ColorOutput "🚀 Starting $ServiceName on port $Port..." $Color
    
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "powershell.exe"
    $startInfo.Arguments = "-Command `"cd '$ServicePath'; ./mvnw spring-boot:run -Dspring-boot.run.profiles=$Profile`""
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
    $startInfo.UseShellExecute = $true
    
    try {
        $process = [System.Diagnostics.Process]::Start($startInfo)
        Write-ColorOutput "✅ $ServiceName started (PID: $($process.Id))" $Color
        
        # 간단한 헬스체크 (선택적)
        if ($ServiceName -ne "Gateway") {
            Start-Sleep -Seconds 3
            Write-ColorOutput "   $ServiceName starting up..." "Gray"
        }
    } catch {
        Write-ColorOutput "❌ Failed to start $ServiceName`: $_" "Red"
    }
}

# Vue 프론트엔드 시작
function Start-VueFrontend {
    $frontendPath = "frontend/web-app"
    $port = 3000
    
    if (Test-Port $port) {
        Write-ColorOutput "⚠️  Port $port already in use, skipping Vue frontend" "Yellow"
        return
    }
    
    if (-not (Test-Path $frontendPath)) {
        Write-ColorOutput "❌ Frontend directory not found: $frontendPath" "Red"
        return
    }
    
    Write-ColorOutput "🎨 Starting Vue 3 frontend on port $port..." "Magenta"
    
    # package.json 존재 확인
    if (-not (Test-Path "$frontendPath/package.json")) {
        Write-ColorOutput "❌ package.json not found in $frontendPath" "Red"
        return
    }
    
    # node_modules 확인 및 설치
    if (-not (Test-Path "$frontendPath/node_modules")) {
        Write-ColorOutput "📦 Installing npm dependencies..." "Yellow"
        $installInfo = New-Object System.Diagnostics.ProcessStartInfo
        $installInfo.FileName = "powershell.exe"
        $installInfo.Arguments = "-Command `"cd '$frontendPath'; npm install`""
        $installInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
        $installInfo.UseShellExecute = $true
        
        $installProcess = [System.Diagnostics.Process]::Start($installInfo)
        $installProcess.WaitForExit()
        
        if ($installProcess.ExitCode -ne 0) {
            Write-ColorOutput "❌ npm install failed" "Red"
            return
        }
    }
    
    # Vue 개발 서버 시작
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "powershell.exe"
    $startInfo.Arguments = "-Command `"cd '$frontendPath'; npm run dev`""
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
    $startInfo.UseShellExecute = $true
    
    try {
        $process = [System.Diagnostics.Process]::Start($startInfo)
        Write-ColorOutput "✅ Vue frontend started (PID: $($process.Id))" "Magenta"
        Write-ColorOutput "   Frontend URL: http://localhost:$port" "Cyan"
    } catch {
        Write-ColorOutput "❌ Failed to start Vue frontend: $_" "Red"
    }
}

# 서비스 상태 확인
function Show-ServicesStatus {
    Write-ColorOutput "" 
    Write-ColorOutput "📊 Services Status:" "Cyan"
    Write-ColorOutput "==================" "Cyan"
    
    $services = @(
        @{Name="Gateway"; Port=8080; Url="http://localhost:8080/actuator/health"},
        @{Name="Auth Service"; Port=8081; Url="http://localhost:8081/actuator/health"},
        @{Name="Tenant Service"; Port=8082; Url="http://localhost:8082/actuator/health"},
        @{Name="PMIS Service"; Port=8083; Url="http://localhost:8083/actuator/health"},
        @{Name="EPMS Service"; Port=8084; Url="http://localhost:8084/actuator/health"},
        @{Name="ERP Service"; Port=8085; Url="http://localhost:8085/actuator/health"},
        @{Name="Vue Frontend"; Port=3000; Url="http://localhost:3000"}
    )
    
    foreach ($service in $services) {
        $status = if (Test-Port $service.Port) { "🟢 Running" } else { "🔴 Stopped" }
        Write-ColorOutput "  $($service.Name): $status (Port: $($service.Port))" "White"
    }
    
    Write-ColorOutput ""
    Write-ColorOutput "🌐 Access URLs:" "Cyan"
    Write-ColorOutput "  • Main App: http://localhost:3000" "Green"
    Write-ColorOutput "  • API Gateway: http://localhost:8080" "Green"  
    Write-ColorOutput "  • Swagger UI: http://localhost:8080/swagger-ui.html" "Green"
    Write-ColorOutput "  • API Docs: http://localhost:8080/v3/api-docs" "Green"
}

# 메인 실행 함수
function Main {
    Show-Header
    
    # 환경 변수 로드
    Load-EnvironmentVariables
    
    # 선행 조건 확인
    if (-not (Test-Prerequisites)) {
        Write-ColorOutput "❌ Prerequisites not met. Exiting..." "Red"
        exit 1
    }
    
    Write-ColorOutput ""
    Write-ColorOutput "🚀 Starting ROIPLATFORM services with profile: $Profile" "Green"
    Write-ColorOutput ""
    
    # 백엔드 서비스들 시작 (의존성 순서)
    $backendServices = @(
        @{Name="Gateway"; Path="backend/roiplatform-gateway"; Port=8080; Color="Green"},
        @{Name="Auth Service"; Path="backend/roiplatform-auth"; Port=8081; Color="Yellow"},
        @{Name="Tenant Service"; Path="backend/roiplatform-tenant"; Port=8082; Color="Cyan"},
        @{Name="PMIS Service"; Path="backend/roiplatform-pmis"; Port=8083; Color="Blue"},
        @{Name="EPMS Service"; Path="backend/roiplatform-epms"; Port=8084; Color="Magenta"},
        @{Name="ERP Service"; Path="backend/roiplatform-erp"; Port=8085; Color="Red"}
    )
    
    foreach ($service in $backendServices) {
        if ($SkipGateway -and $service.Name -eq "Gateway") {
            Write-ColorOutput "⏭️  Skipping Gateway service" "Yellow"
            continue
        }
        
        Start-SpringBootService -ServiceName $service.Name -ServicePath $service.Path -Port $service.Port -Color $service.Color
        
        # Gateway는 조금 더 기다림 (다른 서비스들의 라우팅 준비)
        if ($service.Name -eq "Gateway") {
            Start-Sleep -Seconds 5
        } else {
            Start-Sleep -Seconds 2
        }
    }
    
    # 프론트엔드 시작
    if (-not $SkipFrontend) {
        Write-ColorOutput ""
        Start-VueFrontend
    }
    
    # 잠시 대기 후 상태 표시
    Write-ColorOutput ""
    Write-ColorOutput "⏳ Waiting for services to fully start..." "Yellow"
    Start-Sleep -Seconds 10
    
    Show-ServicesStatus
    
    Write-ColorOutput ""
    Write-ColorOutput "🎉 ROIPLATFORM development environment started!" "Green"
    Write-ColorOutput "   Check individual terminal windows for service logs" "Gray"
    Write-ColorOutput "   Use Ctrl+C in each terminal to stop services" "Gray"
    Write-ColorOutput ""
    Write-ColorOutput "📖 For more information, see DEV_SETUP_GUIDE.md" "Cyan"
}

# 스크립트 실행
try {
    Main
} catch {
    Write-ColorOutput "❌ An error occurred: $_" "Red"
    Write-ColorOutput "Stack trace: $($_.ScriptStackTrace)" "Red"
    exit 1
}

# 사용법 도움말
if ($args -contains "-h" -or $args -contains "--help") {
    Write-ColorOutput ""
    Write-ColorOutput "Usage: .\start-all-services.ps1 [OPTIONS]" "Cyan"
    Write-ColorOutput ""
    Write-ColorOutput "Options:" "Yellow"
    Write-ColorOutput "  -Profile <profile>    Spring profile to use (default: dev)" "White"
    Write-ColorOutput "  -SkipFrontend         Skip starting Vue frontend" "White"
    Write-ColorOutput "  -SkipGateway          Skip starting Gateway service" "White"
    Write-ColorOutput "  -Verbose              Enable verbose output" "White"
    Write-ColorOutput "  -h, --help            Show this help message" "White"
    Write-ColorOutput ""
    Write-ColorOutput "Examples:" "Yellow"
    Write-ColorOutput "  .\start-all-services.ps1" "Gray"
    Write-ColorOutput "  .\start-all-services.ps1 -Profile local" "Gray"
    Write-ColorOutput "  .\start-all-services.ps1 -SkipFrontend -Verbose" "Gray"
    Write-ColorOutput ""
}