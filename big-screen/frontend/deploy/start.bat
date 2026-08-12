@echo off
cd /d "%~dp0"
if exist node.exe (
  node.exe start.cjs
) else (
  node start.cjs
)
