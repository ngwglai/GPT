@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul || (echo Install Python 3.11+ first. & exit /b 1)
where npm >nul 2>nul || (echo Install Node.js 20.19+ first. & exit /b 1)
if not exist .venv\Scripts\python.exe py -3 -m venv .venv
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m pip install --upgrade pip==26.2.1 setuptools==84.1.0
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m pip install -e .
if errorlevel 1 exit /b 1
call npm --prefix frontend ci
if errorlevel 1 exit /b 1
call npm --prefix frontend run build
if errorlevel 1 exit /b 1
echo Open http://127.0.0.1:8765 after the server starts. Ctrl+C stops it.
.venv\Scripts\python.exe -m constraintlab.cli --serve
