#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PY="C:/Users/Lenovo/.workbuddy/binaries/python/versions/3.13.12/python.exe"
if [ ! -f "$PY" ]; then
  echo "ERROR: managed python not found at $PY"
  exit 1
fi
"$PY" download_models.py
read -p "Press Enter to continue..."
