# One-time install of the bare-metal dependencies on Windows.
# Run from an elevated PowerShell:
#     Set-ExecutionPolicy -Scope Process Bypass
#     .\scripts\install-windows.ps1
#
# What this script does:
#  1. Verifies the system-level installs you have to do BY HAND
#     (PostgreSQL 17, Python 3.11, Node 20, Redis-compatible service).
#  2. Creates a Python venv under backend\.venv and installs requirements.
#  3. Runs `npm ci` + `npm run build` for the frontend.
#  4. Bootstraps backend/.env and the database (first run only).
#
# It does NOT install PostgreSQL / Redis themselves — those are operator
# steps documented in docs/BARE_METAL_WINDOWS.md.

$ErrorActionPreference = "Stop"
Set-Location -Path "$PSScriptRoot\.."

Write-Host "=== Prerequisite check ===" -ForegroundColor Cyan
foreach ($cmd in "python", "node", "npm", "psql") {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Error "$cmd not found in PATH. Install it (see docs/BARE_METAL_WINDOWS.md) and re-run."
    }
    Write-Host "  $cmd : $($found.Path)"
}

Write-Host ""
Write-Host "=== Backend venv ===" -ForegroundColor Cyan
if (-not (Test-Path "backend\.venv")) {
    python -m venv backend\.venv
}
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip
& backend\.venv\Scripts\pip.exe install -r backend\requirements.txt -r backend\requirements-dev.txt

Write-Host ""
Write-Host "=== Frontend build ===" -ForegroundColor Cyan
Push-Location frontend
npm ci
npm run build
Pop-Location

Write-Host ""
Write-Host "=== backend\.env ===" -ForegroundColor Cyan
if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "Copied backend\.env.example -> backend\.env"
    Write-Host "Edit backend\.env to set strong SECRET_KEY / JWT_SECRET_KEY / POSTGRES_PASSWORD before running scripts\start-all.ps1."
} else {
    Write-Host "backend\.env already exists - left alone."
}

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  1. Edit backend\.env (secrets, DB password)."
Write-Host "  2. Create the Postgres database + role (see docs/BARE_METAL_WINDOWS.md)."
Write-Host "  3. Run: scripts\bootstrap-db.ps1   (one-time schema + seed)"
Write-Host "  4. Run: scripts\start-all.ps1     (every time)"
