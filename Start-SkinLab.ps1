$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$backendPython = Join-Path $project '.venv\Scripts\python.exe'
$frontendDir = Join-Path $project 'frontend'
$backendPort = 5000
$backendUrl = "http://127.0.0.1:$backendPort"
$backendHealthUrl = "$backendUrl/api/health"
$logDirectory = Join-Path $env:TEMP 'SkinLab\logs'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backendStdoutLog = Join-Path $logDirectory "backend-$runId.stdout.log"
$backendStderrLog = Join-Path $logDirectory "backend-$runId.stderr.log"
$frontendStdoutLog = Join-Path $logDirectory "frontend-$runId.stdout.log"
$frontendStderrLog = Join-Path $logDirectory "frontend-$runId.stderr.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Test-WebReady {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 3
    )

    # Do not route loopback health checks through a configured system proxy.
    # Invoke-WebRequest can honor proxy settings differently across Windows
    # PowerShell versions and report a false negative for localhost services.
    Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.UseProxy = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
    try {
        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        $ready = $response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500
        $response.Dispose()
        return $ready
    } catch {
        $script:LastWebReadyError = "$($_.Exception.GetType().Name): $($_.Exception.Message)"
        return $false
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

function Test-PortAvailable {
    param([Parameter(Mandatory = $true)][int]$Port)

    # Binding alone is insufficient on Windows: apps using SO_REUSEADDR can
    # make an occupied port appear bindable. Check listeners before the bind.
    if (@(Get-PortListeners -Port $Port).Count) { return $false }

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $listener.ExclusiveAddressUse = $true
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        $listener.Stop()
    }
}

function Get-PortListeners {
    param([Parameter(Mandatory = $true)][int]$Port)

    $processIds = @()
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        try {
            $processIds = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop |
                Select-Object -ExpandProperty OwningProcess -Unique)
        } catch {
            $processIds = @()
        }
    }

    if (-not $processIds.Count) {
        $portPattern = ":$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
        $processIds = @(& "$env:SystemRoot\System32\netstat.exe" -ano -p TCP 2>$null |
            ForEach-Object {
                if ($_ -match $portPattern) { [int]$Matches[1] }
            } | Select-Object -Unique)
    }

    foreach ($processId in $processIds) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
        if ($process) {
            [pscustomobject]@{
                Id = [int]$process.ProcessId
                Name = [string]$process.Name
                Path = [string]$process.ExecutablePath
                CommandLine = [string]$process.CommandLine
            }
        } else {
            [pscustomobject]@{ Id = [int]$processId; Name = 'unknown'; Path = ''; CommandLine = '' }
        }
    }
}

function Get-SkinLabFrontendProcesses {
    $frontendPath = [IO.Path]::GetFullPath($frontendDir).TrimEnd('\')
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine.IndexOf($frontendPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $_.CommandLine -match '(?i)(next.*\bdev\b|next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js)'
        }
}

function Format-PortListeners {
    param([object[]]$Listeners)

    if (-not $Listeners.Count) { return 'none' }
    return (($Listeners | ForEach-Object { "PID $($_.Id) $($_.Name) $($_.Path)" }) -join '; ')
}

function Stop-StaleSkinLabBackends {
    param([Parameter(Mandatory = $true)][int]$Port)

    $listeners = @(Get-PortListeners -Port $Port)
    if (-not $listeners.Count) { return }

    $pythonPath = [IO.Path]::GetFullPath($backendPython)
    $staleBackends = @($listeners | Where-Object {
        $_.Path -and [IO.Path]::GetFullPath($_.Path) -ieq $pythonPath -and
        $_.CommandLine -match '(?i)(^|[\s/\\])src[/\\]app\.py(?:\s|$)'
    })
    foreach ($process in $staleBackends) {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
    }

    if ($staleBackends.Count) {
        $deadline = (Get-Date).AddSeconds(10)
        do {
            Start-Sleep -Milliseconds 500
            $listeners = @(Get-PortListeners -Port $Port)
        } while ($listeners.Count -and (Get-Date) -lt $deadline)
    }

    return $listeners
}

function Start-SkinLabWindow {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$StdoutLog,
        [Parameter(Mandatory = $true)][string]$StderrLog
    )

    Start-Process -FilePath $FilePath -ArgumentList $Arguments -PassThru `
        -WorkingDirectory $WorkingDirectory -WindowStyle Hidden `
        -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
}

function Show-StartupLogs {
    param([string[]]$Paths)

    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path) {
            Write-Host "`n--- $path (last 50 lines) ---" -ForegroundColor DarkCyan
            Get-Content -LiteralPath $path -Tail 50
        }
    }
}

if (-not (Test-Path -LiteralPath $backendPython)) {
    throw 'The project Python environment is missing (.venv\Scripts\python.exe). Create .venv and install the backend requirements first.'
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules'))) {
    throw 'The frontend dependencies are missing (frontend\node_modules). Run "pnpm install" in the frontend folder first.'
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw 'pnpm is required to run the frontend. Install it from https://pnpm.io/installation and retry.'
}

# Start the Flask backend unless a healthy instance is already listening.
if (Test-WebReady -Url $backendHealthUrl -TimeoutSec 2) {
    Write-Host "Backend already running at $backendUrl."
} else {
    $listeners = @(Stop-StaleSkinLabBackends -Port $backendPort)
    if (-not (Test-PortAvailable -Port $backendPort)) {
        $originalBackendPort = $backendPort
        $backendPort = 5001
        while ($backendPort -le 5010 -and -not (Test-PortAvailable -Port $backendPort)) {
            $backendPort++
        }
        if ($backendPort -gt 5010) {
            throw "Backend ports 5000-5010 are occupied. Port 5000 listener(s): $(Format-PortListeners -Listeners $listeners). Close one and retry."
        }
        Write-Host "Port $originalBackendPort is already in use; starting the SkinLab backend on $backendPort instead."
    }
    $backendUrl = "http://127.0.0.1:$backendPort"
    $backendHealthUrl = "$backendUrl/api/health"

    Write-Host 'Starting the Flask backend...'
    $previousFlaskPort = $env:FLASK_PORT
    $env:FLASK_PORT = [string]$backendPort
    try {
        $backendProcess = Start-SkinLabWindow -FilePath $backendPython -Arguments @('src/app.py') `
            -WorkingDirectory $project -StdoutLog $backendStdoutLog -StderrLog $backendStderrLog
    } finally {
        $env:FLASK_PORT = $previousFlaskPort
    }

    # TensorFlow model loading can take 20-60 seconds, so poll until ready.
    $deadline = (Get-Date).AddSeconds(120)
    $serverListeningSince = $null
    while (-not (Test-WebReady -Url $backendHealthUrl -TimeoutSec 3)) {
        if ($backendProcess.HasExited) {
            Show-StartupLogs -Paths @($backendStdoutLog, $backendStderrLog)
            throw "The Flask backend exited before its health check passed. Logs are saved under $logDirectory."
        }
        if (-not $serverListeningSince -and (Select-String -LiteralPath $backendStdoutLog -Pattern "Running on http://127.0.0.1:$backendPort" -Quiet -ErrorAction SilentlyContinue)) {
            $serverListeningSince = Get-Date
        }
        if ($serverListeningSince -and (Get-Date) -ge $serverListeningSince.AddSeconds(15)) {
            $listeners = @(Get-PortListeners -Port $backendPort)
            Show-StartupLogs -Paths @($backendStdoutLog, $backendStderrLog)
            Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
            throw "Flask is listening on port $backendPort, but this Windows session cannot reach its local health endpoint. Listener(s): $(Format-PortListeners -Listeners $listeners). Check local security software or firewall rules. Logs are saved under $logDirectory."
        }
        if ((Get-Date) -ge $deadline) {
            Show-StartupLogs -Paths @($backendStdoutLog, $backendStderrLog)
            Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
            throw "The backend did not become ready at $backendHealthUrl within 120 seconds. Last local probe: $script:LastWebReadyError. Logs are saved under $logDirectory."
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "Backend ready at $backendUrl."
}

# Next.js permits only one dev server per project directory. If this project is
# already serving on a supported port, reuse it instead of starting a second
# process that would exit on the shared .next dev lock.
$frontendProcesses = @(Get-SkinLabFrontendProcesses)
if ($frontendProcesses.Count) {
    $frontendProcessIds = @($frontendProcesses | ForEach-Object { [int]$_.ProcessId })
    foreach ($existingPort in 3000..3010) {
        $listeners = @(Get-PortListeners -Port $existingPort)
        if (@($listeners | Where-Object { $frontendProcessIds -contains $_.Id }).Count -gt 0) {
            $existingFrontendUrl = "http://127.0.0.1:$existingPort"
            if (Test-WebReady -Url $existingFrontendUrl -TimeoutSec 3) {
                Start-Process $existingFrontendUrl
                Write-Host "SkinLab is already running at $existingFrontendUrl. Opened the existing project."
                return
            }
        }
    }
}

# Pick the first free frontend port in the supported range.
$port = 3000
while ($port -le 3010 -and -not (Test-PortAvailable -Port $port)) {
    $port++
}
if ($port -gt 3010) {
    throw 'Ports 3000-3010 are all in use. Close another application and retry.'
}

Write-Host "Starting the Next.js frontend on port $port..."
$nodeCommand = Get-Command node -ErrorAction Stop
$nextCli = Join-Path $frontendDir 'node_modules\next\dist\bin\next'
$previousFlaskApiUrl = $env:FLASK_API_URL
$env:FLASK_API_URL = $backendUrl
try {
    $frontendProcess = Start-SkinLabWindow -FilePath $nodeCommand.Source `
        -Arguments @(('"' + $nextCli + '"'), 'dev', '--hostname', '127.0.0.1', '--port', "$port") `
        -WorkingDirectory $frontendDir -StdoutLog $frontendStdoutLog -StderrLog $frontendStderrLog
} finally {
    $env:FLASK_API_URL = $previousFlaskApiUrl
}

$frontendUrl = "http://127.0.0.1:$port"
$deadline = (Get-Date).AddMinutes(3)
while (-not (Test-WebReady -Url $frontendUrl -TimeoutSec 5)) {
    if ($frontendProcess.HasExited) {
        Show-StartupLogs -Paths @($frontendStdoutLog, $frontendStderrLog)
        if ($backendProcess -and -not $backendProcess.HasExited) {
            Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        }
        throw "The Next.js frontend exited before becoming ready. Logs are saved under $logDirectory."
    }
    if ((Get-Date) -ge $deadline) {
        Show-StartupLogs -Paths @($frontendStdoutLog, $frontendStderrLog)
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
        if ($backendProcess -and -not $backendProcess.HasExited) {
            Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        }
        throw "The website did not become ready at $frontendUrl. Check the minimized frontend window for errors."
    }
    Start-Sleep -Seconds 2
}

# Require the process to remain alive after the first successful HTTP response.
Start-Sleep -Seconds 3
if ($frontendProcess.HasExited -or -not (Test-WebReady -Url $frontendUrl -TimeoutSec 5)) {
    Show-StartupLogs -Paths @($frontendStdoutLog, $frontendStderrLog)
    if (-not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    throw "The Next.js frontend did not remain ready at $frontendUrl. Logs are saved under $logDirectory."
}

Start-Process $frontendUrl
Write-Host "SkinLab is running at $frontendUrl. The servers run in the background."
