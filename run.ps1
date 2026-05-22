# IonQ Dashboard — Windows PowerShell launcher
# Starts the FastAPI backend (port 5181) and Vite frontend (port 5180).
# Press Ctrl+C in this window to stop both.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Resolve python: prefer the local venv if present.
$pyExe = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $pyExe)) {
    $pyExe = (Get-Command python -ErrorAction SilentlyContinue)?.Source
    if (-not $pyExe) {
        $pyExe = (Get-Command py -ErrorAction SilentlyContinue)?.Source
    }
}
if (-not $pyExe) {
    Write-Error "Could not find Python. Install it, or create the venv first: python -m venv .venv"
    exit 1
}

Write-Host "[ionq-dashboard] starting backend on :5181"
$backend = Start-Process -FilePath $pyExe `
    -ArgumentList @("-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "5181") `
    -WorkingDirectory $here -PassThru -NoNewWindow

Write-Host "[ionq-dashboard] starting frontend on :5180"
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue)?.Source
if (-not $npm) { $npm = (Get-Command npm -ErrorAction SilentlyContinue)?.Source }
if (-not $npm) { Write-Error "Could not find npm. Install Node.js (LTS)." ; exit 1 }
$frontend = Start-Process -FilePath $npm `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory (Join-Path $here "frontend") -PassThru -NoNewWindow

Write-Host ""
Write-Host "Open  http://localhost:5180  in your browser."
Write-Host "Press Ctrl+C here to stop both servers."

try {
    Wait-Process -Id $backend.Id, $frontend.Id
} finally {
    foreach ($p in @($backend, $frontend)) {
        if ($p -and -not $p.HasExited) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
}
