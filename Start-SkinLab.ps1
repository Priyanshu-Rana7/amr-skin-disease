$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$backendPython = Join-Path $project '.venv\Scripts\python.exe'
$frontendDir = Join-Path $project 'frontend'

if (-not (Test-Path -LiteralPath $backendPython)) { throw 'The project Python environment is missing. Create .venv and install the backend requirements first.' }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm is required to run the frontend.' }

$port = 3000
while ($port -le 3010) {
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $probe.Start(); $probe.Stop(); break } catch { $probe.Stop(); $port++ }
}
if ($port -gt 3010) { throw 'Ports 3000–3010 are all in use. Close another application and retry.' }

$backendCheck = Invoke-WebRequest -Uri 'http://127.0.0.1:5000/api/health' -TimeoutSec 2 -ErrorAction SilentlyContinue
if (-not $backendCheck) {
    $backendCommand = "Set-Location '$project'; & '$backendPython' src/app.py"
    Start-Process powershell.exe -WindowStyle Minimized -ArgumentList @('-NoExit','-Command',$backendCommand)
}

$frontendCommand = "Set-Location '$frontendDir'; pnpm exec next dev --hostname 127.0.0.1 --port $port"
Start-Process powershell.exe -WindowStyle Minimized -ArgumentList @('-NoExit','-Command',$frontendCommand)

$deadline = (Get-Date).AddMinutes(2)
$ready = $false
do {
    Start-Sleep -Seconds 2
    try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$port" -TimeoutSec 3; $ready = $true } catch { }
} while (-not $ready -and (Get-Date) -lt $deadline)
if (-not $ready) { throw 'The website did not become ready. Check the minimized backend and frontend terminal windows.' }
Start-Process "http://localhost:$port"
Write-Host "SkinLab is running at http://localhost:$port. Close the backend and frontend terminal windows to stop it."
