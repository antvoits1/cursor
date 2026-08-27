@echo off
rem Internal helper launched by START-EXTRACTOR.bat
setlocal EnableExtensions
cd /d "%~dp0\.."

set "NODE_ENV=production"
set "HOST=127.0.0.1"
if not defined PORT set "PORT=3000"
set "VENV=%CD%\.venv"
set "PATH=%VENV%\Scripts;%PATH%"
if exist "%VENV%\Scripts\python.exe" set "EXTRACTOR_PYTHON=%VENV%\Scripts\python.exe"

node .\scripts\start-production.mjs
