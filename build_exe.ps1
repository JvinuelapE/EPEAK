# Builds dist\E-PEAK.exe — a single file your colleagues can run without installing Python.
# Usage: double-click build_exe.bat, or run  .\build_exe.ps1  in PowerShell from this folder.
# The interface (frontend\src) is rebuilt first, so the .exe always contains the latest changes.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Rebuild the interface so PyInstaller bundles an up-to-date frontend\dist
if (Get-Command npm -ErrorAction SilentlyContinue) {
    Push-Location frontend
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "Installing interface packages..." -ForegroundColor Cyan
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        }
        Write-Host "Building the interface..." -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "The interface build failed. Fix the errors above, then run build_exe.bat again." }
    } finally {
        Pop-Location
    }
} elseif (-not (Test-Path "frontend\dist\index.html")) {
    throw "frontend\dist is missing and Node.js (npm) isn't installed. Install Node.js from https://nodejs.org and run this again."
} else {
    Write-Host "Node.js (npm) not found: packaging the existing frontend\dist build, which may be out of date." -ForegroundColor Yellow
}

# Pick a Python: the Windows launcher if present, otherwise python on PATH
$pyExe = $null; $pyArgs = @()
if (Get-Command py -ErrorAction SilentlyContinue) { $pyExe = "py"; $pyArgs = @("-3") }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $pyExe = "python" }
else { throw "Python 3.10+ is needed to build the .exe (only for building; users of the .exe don't need it)." }

$venv = ".build-venv"
if (-not (Test-Path "$venv\Scripts\python.exe")) {
    Write-Host "Creating build environment..." -ForegroundColor Cyan
    & $pyExe @pyArgs -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the build environment" }
}
$vpy = Resolve-Path "$venv\Scripts\python.exe"

Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $vpy -m pip install --upgrade pip --quiet
& $vpy -m pip install -r requirements.txt "pyinstaller>=6.10" --quiet
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Write-Host "Building E-PEAK.exe (takes a minute or two)..." -ForegroundColor Cyan
& $vpy -m PyInstaller --noconfirm --clean --distpath dist --workpath build packaging\epeak.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

$exe = Resolve-Path "dist\E-PEAK.exe"
$size = "{0:N0} MB" -f ((Get-Item $exe).Length / 1MB)
Write-Host ""
Write-Host "Done: $exe ($size)"  -ForegroundColor Green
Write-Host "Share that single file. Each user's data is stored in %LOCALAPPDATA%\E-PEAK."
