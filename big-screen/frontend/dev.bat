@echo off
REM 关闭 WorkBuddy 的「安全删除」垫片，避免 next 清理 .next 缓存时崩溃
set NODE_OPTIONS=
set CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR=
set CODEBUDDY_TOOL_CALL_ID=

cd /d "%~dp0"
npm run dev
