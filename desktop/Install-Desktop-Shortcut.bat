@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Desktop-Shortcut.ps1"
if errorlevel 1 (
  echo Shortcut install failed.
  pause
  exit /b 1
)
echo.
echo Done. Double-click "Extractor" on your Desktop anytime.
pause
