@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0" || goto directory_failed

set "MAHJONG_HOST=%~1"
if not defined MAHJONG_HOST set "MAHJONG_HOST=127.0.0.1"
if exist "runtime\python.exe" goto portable_runtime

set "VENV_PYTHON=.venv\Scripts\python.exe"
set "PYTHON_PROBE=import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if not exist "%VENV_PYTHON%" goto find_python
"%VENV_PYTHON%" -c "%PYTHON_PROBE%" >nul 2>&1
if not errorlevel 1 goto install_dependencies

:find_python
py -3 -c "%PYTHON_PROBE%" >nul 2>&1
if not errorlevel 1 goto create_with_py
python -c "%PYTHON_PROBE%" >nul 2>&1
if not errorlevel 1 goto create_with_python
python3 -c "%PYTHON_PROBE%" >nul 2>&1
if not errorlevel 1 goto create_with_python3
echo 未找到 Python 3.11 或更高版本。请安装 Python，并启用 Python 启动器或将 Python 加入 PATH。
goto fail

:create_with_py
py -3 -m venv ".venv"
if errorlevel 1 goto venv_failed
goto verify_venv

:create_with_python
python -m venv ".venv"
if errorlevel 1 goto venv_failed
goto verify_venv

:create_with_python3
python3 -m venv ".venv"
if errorlevel 1 goto venv_failed

:verify_venv
"%VENV_PYTHON%" -c "%PYTHON_PROBE%"
if errorlevel 1 goto venv_failed

:install_dependencies
echo 正在检查依赖。首次启动需要访问 Python 软件源。
"%VENV_PYTHON%" -m pip --disable-pip-version-check install -r "requirements.txt"
if errorlevel 1 goto dependencies_failed
"%VENV_PYTHON%" -m pip --disable-pip-version-check check
if errorlevel 1 goto dependencies_failed
"%VENV_PYTHON%" -c "import aiohttp"
if errorlevel 1 goto dependencies_failed

"%VENV_PYTHON%" "web_server.py" --host "%MAHJONG_HOST%"
if errorlevel 1 goto server_failed
popd
exit /b 0

:portable_runtime
"runtime\python.exe" -c "import aiohttp, mahjong"
if errorlevel 1 goto dependencies_failed
"runtime\python.exe" "web_server.py" --host "%MAHJONG_HOST%"
if errorlevel 1 goto server_failed
popd
exit /b 0

:directory_failed
echo 无法进入游戏目录。请完整解压 ZIP 后再运行启动脚本。
pause
exit /b 1

:venv_failed
echo 创建或修复 .venv 失败。请检查目录写入权限。若目录来自旧版，可改名旧 .venv 后重试。
goto fail

:dependencies_failed
echo 依赖安装或检查失败。请确认 requirements.txt 存在，并检查上方 pip 输出和网络连接。
goto fail

:server_failed
echo 麻将服务器启动失败。请查看上方错误，确认端口 8765 可用。

:fail
popd
pause
exit /b 1
