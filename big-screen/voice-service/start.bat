@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM 端口与 ASR/TTS 后端：优先 voice-service\.env（server.py 启动时加载）
REM 无 .env 时默认 vosk + piper（离线）。方案 A：copy .env.example .env 并填 Key。
if not exist ".env" (
  echo [hint] 未找到 .env，使用离线默认 vosk+piper。方案 A 请：copy .env.example .env
)

set "VOICE_SERVICE_PORT=8000"

set "PYTHON=C:\Users\Lenovo\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo ERROR: venv python not found at %PYTHON%
  echo please run download_models.bat first.
  pause
  exit /b 1
)

"%PYTHON%" server.py
pause
