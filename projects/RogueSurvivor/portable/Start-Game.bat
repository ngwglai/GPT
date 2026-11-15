@echo off
setlocal
cd /d "%~dp0"

py -3 --version >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0launcher.py"
    goto finished
)

python --version 2>&1 | findstr /B /C:"Python 3." >nul
if not errorlevel 1 (
    python "%~dp0launcher.py"
    goto finished
)

echo Python 3 is required. Install Python 3 and try again.
pause
exit /b 1

:finished
if errorlevel 1 (
    echo The game launcher stopped with an error.
    pause
)
endlocal
