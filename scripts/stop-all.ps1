# Stop every process started by start-all.ps1.
# Closes the four labelled PowerShell windows by title.
$ErrorActionPreference = "Continue"
foreach ($title in "housing-backend", "housing-worker", "housing-beat", "housing-frontend") {
    $procs = Get-Process powershell -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowTitle -eq $title
    }
    if ($procs) {
        Write-Host "Stopping $title (PID $($procs.Id -join ', '))..."
        $procs | Stop-Process -Force
    }
}
# Belt-and-braces: kill any orphaned waitress / celery / next processes.
Get-Process waitress-serve, celery, node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and ($_.Path -like "*Employee-Housing-Control-Portal*")
} | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Done."
