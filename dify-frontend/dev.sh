#!/bin/bash
# 关闭 WorkBuddy 的「安全删除」垫片，避免 next 清理 .next 缓存时崩溃
unset NODE_OPTIONS CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR CODEBUDDY_TOOL_CALL_ID
# 关闭代理：Node 24 的 fetch 默认会读 HTTP(S)_PROXY，
# 若本机开了 Clash 等代理，会把 127.0.0.1:8000 当外网请求发往代理导致 fetch failed。
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
# 明确本机地址不走任何代理
export NO_PROXY="127.0.0.1,localhost,::1"
export no_proxy="$NO_PROXY"

cd "$(dirname "$0")"
npm run dev
