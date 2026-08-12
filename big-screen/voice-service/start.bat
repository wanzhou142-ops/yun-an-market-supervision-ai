@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "VOICE_SERVICE_PORT=8000"
set "TTS_BACKEND=piper"
set "ASR_BACKEND=vosk"

set "PYTHON=C:\Users\Lenovo\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo ERROR: venv python not found at %PYTHON%
  echo please run download_models.bat first.
  pause
  exit /b 1
)

"%PYTHON%" server.py
pause
