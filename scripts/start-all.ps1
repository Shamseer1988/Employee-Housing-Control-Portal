# Start every process the housing app needs, in the right order.
# Each process opens in its own PowerShell window so you can read logs
# without docker.
#
# Order:
#   1. Backend (waitress on 127.0.0.1:5000)
#   2. Celery worker
#   3. Celery beat
#   4. Frontend (Next.js on 127.0.0.1:3000)
#
# Postgres + Redis are assumed to be running as Windows services already
# (see docs/BARE_METAL_WINDOWS.md). If they aren't, the backend will hang
# on wait-for-db.

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..").Path
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

function Start-InNewWindow($title, $workdir, $command) {
    Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$Host.UI.RawUI.WindowTitle='$title'; Set-Location '$workdir'; $command"
    ) | Out-Null
}

Write-Host "Starting backend (waitress)..." -ForegroundColor Cyan
Start-InNewWindow "housing-backend" $backend `
    "& .venv\Scripts\waitress-serve.exe --listen=`$env:WAITRESS_LISTEN --threads=`$env:WAITRESS_THREADS wsgi:app"

Start-Sleep -Seconds 3

Write-Host "Starting Celery worker..." -ForegroundColor Cyan
Start-InNewWindow "housing-worker" $backend `
    "& .venv\Scripts\celery.exe -A celery_worker.celery worker --loglevel=info --pool=solo"

Write-Host "Starting Celery beat..." -ForegroundColor Cyan
Start-InNewWindow "housing-beat" $backend `
    "& .venv\Scripts\celery.exe -A celery_worker.celery beat --loglevel=info --schedule=$env:TEMP\celerybeat-schedule"

Write-Host "Starting Next.js frontend..." -ForegroundColor Cyan
Start-InNewWindow "housing-frontend" $frontend `
    "npm start"

Write-Host ""
Write-Host "Four windows opened. Tail their output to confirm everything is up."
Write-Host "Backend health:   curl http://127.0.0.1:5000/api/v1/health"
Write-Host "Frontend:         http://127.0.0.1:3000"
Write-Host "Public (Cloudflare): https://accommodation.parisunitedgroup.com"
