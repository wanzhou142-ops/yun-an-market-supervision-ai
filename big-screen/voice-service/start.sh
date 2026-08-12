#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export VOICE_SERVICE_PORT="${VOICE_SERVICE_PORT:-8000}"
export TTS_BACKEND="${TTS_BACKEND:-piper}"
export ASR_BACKEND="${ASR_BACKEND:-vosk}"
PYTHON="C:/Users/Lenovo/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
if [ ! -f "$PYTHON" ]; then
  echo "ERROR: venv python not found at $PYTHON"
  echo "please run download_models.sh first."
  exit 1
fi
"$PYTHON" server.py
