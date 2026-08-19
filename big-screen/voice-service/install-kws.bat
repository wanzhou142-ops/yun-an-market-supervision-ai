@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo [install-kws] PowerShell 请用: .\install-kws.bat
echo.

set "PYTHON=C:\Users\Lenovo\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo ERROR: venv python not found at %PYTHON%
  echo please run download_models.bat first.
  pause
  exit /b 1
)

set "PIP_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple"

echo [1/3] 安装 sherpa-onnx + websockets…
"%PYTHON%" -m pip install -r requirements-kws.txt -i %PIP_INDEX%
if errorlevel 1 (
  echo ERROR: pip install 失败
  pause
  exit /b 1
)

echo [2/3] 下载 KWS 模型（约 18MB）…
"%PYTHON%" kws\download_kws_models.py
if errorlevel 1 (
  echo ERROR: 模型下载失败
  pause
  exit /b 1
)

echo [3/3] 生成 nav_keywords.txt…
"%PYTHON%" kws\gen_nav_keywords.py
if errorlevel 1 (
  echo ERROR: keywords 生成失败
  pause
  exit /b 1
)

echo.
echo [install-kws] OK. 在 .env 中设置 KWS_ENABLED=true ASR_STREAM=off
echo 重启 voice-service: start.bat
pause
exit /b 0
