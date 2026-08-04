@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PY=C:\Users\Lenovo\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not exist "%PY%" (
  echo ERROR: managed python not found at %PY%
  echo please install python 3.13 via WorkBuddy or change the path in this script.
  pause
  exit /b 1
)
"%PY%" download_models.py
pause
