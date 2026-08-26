@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
set "PORT=3000"
set "URL=http://127.0.0.1:%PORT%"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo Stopping process %%a on port %PORT%...
  taskkill /PID %%a /F >nul 2>&1
)

if exist ".extractor.pid" del /f /q ".extractor.pid" >nul 2>&1
echo Extractor stopped.
pause
