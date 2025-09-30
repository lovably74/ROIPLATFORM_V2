# ====================================================
# ROIPLATFORM V2 - 개발 서비스 중지 스크립트
# Windows Native Process 종료
# ====================================================

param(
    [switch]$Force,
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
    Write-ColorOutput "=============================================" "Red"
    Write-ColorOutput "🛑 ROIPLATFORM V2 - Service Stopper" "Red"
    Write-ColorOutput "Stopping all native development services" "Red"
    Write-ColorOutput "=============================================" "Red"
    Write-ColorOutput ""
}

# 특정 포트의 프로세스 종료
function Stop-ProcessByPort {
    param([int]$Port, [string]$ServiceName)
    
    try {
        # 포트를 사용하는 프로세스 찾기
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        
        if ($connections) {
            foreach ($conn in $connections) {
                $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                if ($process) {
                    Write-ColorOutput "🔍 Found $ServiceName process: $($process.ProcessName) (PID: $($process.Id))" "Yellow"
                    
                    if ($Force) {
                        Write-ColorOutput "💥 Force killing process..." "Red"
                        Stop-Process -Id $process.Id -Force
                    } else {
                        Write-ColorOutput "⏹️  Gracefully stopping process..." "Green"
                        $process.CloseMainWindow()
                        Start-Sleep -Seconds 3
                        
                        # 아직 실행 중이면 강제 종료
                        if (-not $process.HasExited) {
                            Write-ColorOutput "🔨 Process still running, force killing..." "Red"
                            Stop-Process -Id $process.Id -Force
                        }
                    }
                    
                    Write-ColorOutput "✅ $ServiceName stopped (Port: $Port)" "Green"
                } else {
                    Write-ColorOutput "⚠️  Process for port $Port not found" "Yellow"
                }
            }
        } else {
            Write-ColorOutput "ℹ️  No process found on port $Port" "Gray"
        }
    } catch {
        Write-ColorOutput "❌ Error stopping service on port ${Port}: $_" "Red"
        if ($Verbose) {
            Write-ColorOutput "   Stack trace: $($_.ScriptStackTrace)" "Red"
        }
    }
}

# Java 프로세스 중지 (추가 안전장치)
function Stop-JavaProcesses {
    try {
        $javaProcesses = Get-Process -Name "java" -ErrorAction SilentlyContinue | 
                        Where-Object { 
                            $_.CommandLine -like "*spring-boot*" -or 
                            $_.CommandLine -like "*roiplatform*" 
                        }
        
        if ($javaProcesses) {
            Write-ColorOutput "🔍 Found Java/Spring Boot processes:" "Yellow"
            foreach ($proc in $javaProcesses) {
                Write-ColorOutput "   • $($proc.ProcessName) (PID: $($proc.Id))" "Gray"
                
                if ($Force) {
                    Stop-Process -Id $proc.Id -Force
                } else {
                    $proc.CloseMainWindow()
                    Start-Sleep -Seconds 2
                    if (-not $proc.HasExited) {
                        Stop-Process -Id $proc.Id -Force
                    }
                }
                Write-ColorOutput "   ✅ Java process stopped" "Green"
            }
        } else {
            Write-ColorOutput "ℹ️  No Java/Spring Boot processes found" "Gray"
        }
    } catch {
        Write-ColorOutput "❌ Error stopping Java processes: $_" "Red"
    }
}

# Node.js 프로세스 중지 (Vue 개발 서버)
function Stop-NodeProcesses {
    try {
        $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | 
                        Where-Object { 
                            $_.CommandLine -like "*vite*" -or 
                            $_.CommandLine -like "*vue*" -or
                            $_.CommandLine -like "*dev*"
                        }
        
        if ($nodeProcesses) {
            Write-ColorOutput "🔍 Found Node.js/Vue processes:" "Yellow"
            foreach ($proc in $nodeProcesses) {
                Write-ColorOutput "   • $($proc.ProcessName) (PID: $($proc.Id))" "Gray"
                
                if ($Force) {
                    Stop-Process -Id $proc.Id -Force
                } else {
                    $proc.CloseMainWindow()
                    Start-Sleep -Seconds 2
                    if (-not $proc.HasExited) {
                        Stop-Process -Id $proc.Id -Force
                    }
                }
                Write-ColorOutput "   ✅ Node.js process stopped" "Green"
            }
        } else {
            Write-ColorOutput "ℹ️  No Node.js/Vue processes found" "Gray"
        }
    } catch {
        Write-ColorOutput "❌ Error stopping Node.js processes: $_" "Red"
    }
}

# 서비스 상태 확인
function Show-ServicesStatus {
    Write-ColorOutput ""
    Write-ColorOutput "📊 Final Services Status:" "Cyan"
    Write-ColorOutput "========================" "Cyan"
    
    $ports = @(8080, 8081, 8082, 8083, 8084, 8085, 3000)
    $serviceNames = @("Gateway", "Auth", "Tenant", "PMIS", "EPMS", "ERP", "Vue Frontend")
    
    for ($i = 0; $i -lt $ports.Length; $i++) {
        $port = $ports[$i]
        $name = $serviceNames[$i]
        
        $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        $status = if ($connection) { "🟡 Still Running" } else { "🟢 Stopped" }
        
        Write-ColorOutput "  $name (Port: $port): $status" "White"
    }
}

# 확인 프롬프트
function Confirm-Action {
    if (-not $Force) {
        Write-ColorOutput "⚠️  This will stop all ROIPLATFORM development services." "Yellow"
        Write-ColorOutput "   Are you sure you want to continue? (y/N): " "Yellow" -NoNewline
        
        $response = Read-Host
        if ($response -ne "y" -and $response -ne "Y" -and $response -ne "yes") {
            Write-ColorOutput "❌ Operation cancelled by user." "Red"
            exit 0
        }
    }
}

# 메인 실행 함수
function Main {
    Show-Header
    
    # 사용자 확인 (Force 모드가 아닐 때)
    Confirm-Action
    
    Write-ColorOutput "🛑 Stopping ROIPLATFORM services..." "Red"
    Write-ColorOutput ""
    
    # 각 서비스별 포트로 중지
    $services = @(
        @{Name="Vue Frontend"; Port=3000},
        @{Name="ERP Service"; Port=8085},
        @{Name="EPMS Service"; Port=8084},
        @{Name="PMIS Service"; Port=8083},
        @{Name="Tenant Service"; Port=8082},
        @{Name="Auth Service"; Port=8081},
        @{Name="Gateway"; Port=8080}
    )
    
    foreach ($service in $services) {
        Stop-ProcessByPort -Port $service.Port -ServiceName $service.Name
        Start-Sleep -Seconds 1
    }
    
    Write-ColorOutput ""
    Write-ColorOutput "🔍 Checking for remaining processes..." "Yellow"
    
    # 추가 안전장치: Java 및 Node.js 프로세스 직접 정리
    Stop-JavaProcesses
    Stop-NodeProcesses
    
    # 잠시 대기 후 최종 상태 확인
    Write-ColorOutput ""
    Write-ColorOutput "⏳ Waiting for processes to fully terminate..." "Yellow"
    Start-Sleep -Seconds 3
    
    Show-ServicesStatus
    
    Write-ColorOutput ""
    Write-ColorOutput "🎉 All ROIPLATFORM services have been stopped!" "Green"
    Write-ColorOutput "   You can now safely restart services or make changes." "Gray"
    Write-ColorOutput ""
}

# 도움말 표시
function Show-Help {
    Write-ColorOutput ""
    Write-ColorOutput "Usage: .\stop-all-services.ps1 [OPTIONS]" "Cyan"
    Write-ColorOutput ""
    Write-ColorOutput "Options:" "Yellow"
    Write-ColorOutput "  -Force                Force kill processes without confirmation" "White"
    Write-ColorOutput "  -Verbose              Enable verbose output" "White"  
    Write-ColorOutput "  -h, --help            Show this help message" "White"
    Write-ColorOutput ""
    Write-ColorOutput "Examples:" "Yellow"
    Write-ColorOutput "  .\stop-all-services.ps1" "Gray"
    Write-ColorOutput "  .\stop-all-services.ps1 -Force" "Gray"
    Write-ColorOutput "  .\stop-all-services.ps1 -Force -Verbose" "Gray"
    Write-ColorOutput ""
    Write-ColorOutput "Description:" "Yellow"
    Write-ColorOutput "  Stops all ROIPLATFORM development services running as native processes." "Gray"
    Write-ColorOutput "  Services include Spring Boot microservices and Vue.js frontend." "Gray"
    Write-ColorOutput "  Uses graceful shutdown by default, with force option available." "Gray"
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
    Write-ColorOutput "❌ An error occurred: $_" "Red"
    if ($Verbose) {
        Write-ColorOutput "Stack trace: $($_.ScriptStackTrace)" "Red"
    }
    exit 1
}