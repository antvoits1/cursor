@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

set "VENV=%CD%\.venv"

where python >nul 2>&1
if errorlevel 1 (
  where py >nul 2>&1
  if errorlevel 1 (
    echo Python is not installed.
    pause
    exit /b 1
  )
  set "PYTHON=py -3"
) else (
  set "PYTHON=python"
)

echo Installing optional full browser tiers (Patchright + Camoufox)...
echo This download is large and can take a long time.
echo.

if exist "%VENV%\Scripts\activate.bat" (
  call "%VENV%\Scripts\activate.bat"
  python -m pip install -r backend\requirements.txt
  if errorlevel 1 goto :fail
  python -m patchright install chromium
  python -m camoufox fetch
) else (
  %PYTHON% -m pip install --user -r backend\requirements.txt
  if errorlevel 1 goto :fail
  %PYTHON% -m patchright install chromium
  %PYTHON% -m camoufox fetch
)

echo.
echo Full browser tiers installed. Restart Extractor to use them.
pause
exit /b 0

:fail
echo Browser install failed.
pause
exit /b 1
