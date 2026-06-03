# Initialize schema, run phase migrations, seed permissions/roles/super
# user. Run ONCE on a fresh PostgreSQL install (or after `down -v` style
# cleanup). Subsequent restarts use scripts\start-all.ps1 which skips
# this step.

$ErrorActionPreference = "Stop"
Set-Location -Path "$PSScriptRoot\..\backend"

if (-not (Test-Path ".venv")) {
    Write-Error "backend\.venv missing - run scripts\install-windows.ps1 first."
}

$env:PYTHONUNBUFFERED = "1"
& .venv\Scripts\flask.exe --app wsgi wait-for-db
& .venv\Scripts\flask.exe --app wsgi init-db
& .venv\Scripts\flask.exe --app wsgi migrate-all
& .venv\Scripts\flask.exe --app wsgi seed
Write-Host "Done. Run scripts\start-all.ps1 next."
