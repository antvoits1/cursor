@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

set "PORT=3000"
set "URL=http://127.0.0.1:%PORT%"
set "MARKER=%CD%\.extractor-setup-done"
set "VENV=%CD%\.venv"
set "LOG=%CD%\.extractor.log"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js 20+ from https://nodejs.org then run again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js from https://nodejs.org
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  where py >nul 2>&1
  if errorlevel 1 (
    echo Python is not installed.
    echo Install Python 3.11+ from https://www.python.org then run again.
    pause
    exit /b 1
  )
  set "PYTHON=py -3"
) else (
  set "PYTHON=python"
)

curl -fsS "%URL%/api/health" >nul 2>&1
if not errorlevel 1 (
  echo Extractor is already running at %URL%
  start "" "%URL%"
  exit /b 0
)

if not exist "%MARKER%" (
  echo Fast first-time setup — installs the quick backend only...
  echo Optional full browsers can be added later with Install-Full-Browsers.bat
  call npm ci
  if errorlevel 1 goto :fail
  call npm run build
  if errorlevel 1 goto :fail

  %PYTHON% -m venv "%VENV%"
  if errorlevel 1 (
    echo Virtualenv unavailable; installing Python packages for this user instead.
    %PYTHON% -m pip install --user --upgrade pip setuptools wheel
    if errorlevel 1 goto :fail
    %PYTHON% -m pip install --user -r backend\requirements-fast.txt
    if errorlevel 1 goto :fail
  ) else (
    call "%VENV%\Scripts\activate.bat"
    python -m pip install --upgrade pip setuptools wheel
    if errorlevel 1 goto :fail
    python -m pip install -r backend\requirements-fast.txt
    if errorlevel 1 goto :fail
  )

  > "%MARKER%" echo setup-complete-fast
  echo Setup complete.
) else (
  if exist "%VENV%\Scripts\activate.bat" call "%VENV%\Scripts\activate.bat"
)

if not exist "dist\index.html" (
  echo Production UI build missing. Building now...
  call npm run build
  if errorlevel 1 goto :fail
)

set "NODE_ENV=production"
set "HOST=127.0.0.1"
set "PATH=%VENV%\Scripts;%PATH%"

echo Starting Extractor at %URL% ...
> "%LOG%" echo [%DATE% %TIME%] Starting Extractor
start "Extractor" /MIN cmd /c "cd /d \"%CD%\" && set NODE_ENV=production&& set HOST=127.0.0.1&& set PORT=%PORT%&& node .\scripts\start-production.mjs >> \"%LOG%\" 2>&1"

set /a tries=0
:wait
set /a tries+=1
curl -fsS "%URL%/api/health" >nul 2>&1
if not errorlevel 1 goto :ready
if %tries% GEQ 90 goto :fail
timeout /t 1 /nobreak >nul
goto :wait

:ready
echo Ready: %URL%
start "" "%URL%"
exit /b 0

:fail
echo.
echo Startup failed. Last lines from .extractor.log:
echo ----------------------------------------------
if exist "%LOG%" (
  powershell -NoProfile -Command "Get-Content -Path '%LOG%' -Tail 40"
) else (
  echo No log file was created.
)
echo ----------------------------------------------
pause
exit /b 1
