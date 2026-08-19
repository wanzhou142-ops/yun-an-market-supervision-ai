@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo [install-funasr] PowerShell 请用: .\install-funasr.bat
echo.
echo 若当前 pip 下载极慢，先 Ctrl+C 停掉，再重新运行本脚本（已改用国内镜像）。
echo.

set "PYTHON=C:\Users\Lenovo\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo ERROR: venv python not found at %PYTHON%
  echo please run download_models.bat first.
  pause
  exit /b 1
)

REM 国内镜像（清华）；可改为 https://mirrors.aliyun.com/pypi/simple/
set "PIP_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple"

echo [1/3] 升级 pip…
"%PYTHON%" -m pip install -U pip -i %PIP_INDEX%

echo [2/3] 安装 torch CPU（约 120MB，走清华镜像）…
"%PYTHON%" -m pip install torch torchaudio -i %PIP_INDEX%
if errorlevel 1 (
  echo 清华源失败，尝试 PyTorch 官方 CPU 源…
  "%PYTHON%" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
)
if errorlevel 1 (
  echo ERROR: torch 安装失败
  pause
  exit /b 1
)

echo [3/3] 安装 funasr 及其余依赖…
"%PYTHON%" -m pip install "funasr>=1.2.0" "websockets>=12.0" "numpy>=1.24.0" -i %PIP_INDEX%
if errorlevel 1 (
  echo ERROR: funasr 安装失败
  pause
  exit /b 1
)

echo.
echo [install-funasr] OK. Restart voice-service: start.bat
echo First ASR run will download streaming model from ModelScope ~ hundreds MB.
pause
exit /b 0
