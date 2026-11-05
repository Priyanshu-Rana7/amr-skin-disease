$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$backendPython = Join-Path $project '.venv\Scripts\python.exe'
$frontendDir = Join-Path $project 'frontend'
$backendPort = 5000
$backendUrl = "http://127.0.0.1:$backendPort"
$backendHealthUrl = "$backendUrl/api/health"

function Test-WebReady {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 3
    )

    # Invoke-WebRequest throws for refused/timed-out connections. With
    # $ErrorActionPreference = 'Stop' that becomes a terminating error, so the
    # call must always be wrapped in try/catch instead of using -ErrorAction.
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Test-PortAvailable {
    param([Parameter(Mandatory = $true)][int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.ConnectAsync('127.0.0.1', $Port)
        if ($connect.Wait(500) -and $client.Connected) {
            return $false
        }
        return $true
    } catch {
        return $true
    } finally {
        $client.Dispose()
    }
}

function Start-SkinLabWindow {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
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
    if (-not (Test-PortAvailable -Port $backendPort)) {
        throw "Port $backendPort is already in use by another application. Close it and retry, or stop the stale process."
    }

    Write-Host 'Starting the Flask backend...'
    Start-SkinLabWindow -FilePath $backendPython -Arguments @('src/app.py') -WorkingDirectory $project

    # TensorFlow model loading can take 20-60 seconds, so poll until ready.
    $deadline = (Get-Date).AddSeconds(120)
    while (-not (Test-WebReady -Url $backendHealthUrl -TimeoutSec 3)) {
        if ((Get-Date) -ge $deadline) {
            throw "The backend did not become ready at $backendHealthUrl. Check the minimized backend window for errors."
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "Backend ready at $backendUrl."
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
Start-SkinLabWindow -FilePath $nodeCommand.Source -Arguments @(('"' + $nextCli + '"'), 'dev', '--hostname', '127.0.0.1', '--port', "$port") -WorkingDirectory $frontendDir

$frontendUrl = "http://127.0.0.1:$port"
$deadline = (Get-Date).AddMinutes(3)
while (-not (Test-WebReady -Url $frontendUrl -TimeoutSec 5)) {
    if ((Get-Date) -ge $deadline) {
        throw "The website did not become ready at $frontendUrl. Check the minimized frontend window for errors."
    }
    Start-Sleep -Seconds 2
}

Start-Process $frontendUrl
Write-Host "SkinLab is running at $frontendUrl. The servers run in the background."
