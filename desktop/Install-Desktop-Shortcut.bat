@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Creating Desktop shortcut only. This does NOT download packages.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Desktop-Shortcut.ps1"
if errorlevel 1 (
  echo Shortcut install failed.
  pause
  exit /b 1
)
echo.
echo Done. Double-click "Extractor" on your Desktop anytime.
echo If you want to start now without waiting, run START-EXTRACTOR.bat
pause
