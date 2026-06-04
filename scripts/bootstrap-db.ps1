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
$flask = Join-Path (Get-Location) ".venv\Scripts\flask.exe"
& $flask --app wsgi wait-for-db
& $flask --app wsgi init-db
& $flask --app wsgi migrate-all
& $flask --app wsgi seed
Write-Host "Done. Run scripts\start-all.ps1 next."
