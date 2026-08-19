# Step 5 · KWS 导航 + batch ASR 兜底

> 对应 [方案A 实施指南 Step 5](../design/方案A-语音混合架构-实施指南.md) · 验收 **TC-5**

## 架构（2026-08 · KWS 主路径）

**固定命令导航用 KWS（关键词 spotting），不用流式 ASR。final 文本仍走 DashScope REST batch（问答/兜底）。**

```
浏览器 VAD → PCM → sherpa-onnx KWS WS(:10096) → keyword → matchNavFromPartial → 预录 mp3（≤500ms）
句末 VAD 结束 → 若已投机跳转则跳过 batch；否则 POST /asr REST
```

| 组件 | 文件 | 作用 |
|------|------|------|
| KWS WS | `voice-service/kws/kws_ws_server.py` | KeywordSpotter 本地关键词 |
| 关键词表 | `voice-service/kws/nav_keywords_raw.txt` | 导航短语 + 阈值 |
| 前端 KWS | `frontend/lib/kws-stream.ts` | WS 协议 + 长连接 |
| 采集/VAD | `frontend/lib/voice.ts` | energy VAD + KWS 并行送流 |
| 投机匹配 | `frontend/lib/nav-speculative.ts` | `matchNavFromPartial()` |

### 环境变量

**voice-service/.env**

```env
KWS_ENABLED=true
KWS_WS_PORT=10096
ASR_BACKEND=dashscope          # batch REST 兜底
ASR_STREAM=off                 # FunASR 旧路径，默认关闭
```

**frontend/.env.local**

```env
NEXT_PUBLIC_VOICE_NAV=kws
NEXT_PUBLIC_VOICE_KWS_URL=ws://127.0.0.1:10096
NEXT_PUBLIC_VOICE_ASR=batch
NEXT_PUBLIC_NAV_FAST=true
NEXT_PUBLIC_VAD_SILENCE_MS=400
```

### 安装（首次）

```powershell
cd big-screen/voice-service
.\install-kws.bat    # pip sherpa-onnx + 下载模型 + 生成 keywords
start.bat              # 日志应含 KWS WS ws://127.0.0.1:10096/kws
```

### 验收 TC-5（KWS）

| ID | 操作 | 预期 |
|----|------|------|
| TC-5-1 | voice-service 日志 | `KWS WS ws://127.0.0.1:10096/kws` |
| TC-5-2 | 说「普法宣传廊」 | debug `KWS hit` → `partial 投机` → mp3 ≤ ~500ms |
| TC-5-3 | 说「模拟药店」 | keyword 命中 → pharmacy |
| TC-5-4 | KWS 未安装 | 明确报错「请 install-kws.bat」 |

---

## 附录 · FunASR 流式 ASR（旧路径，不推荐导航）

**流式 ASR 已从 DashScope DIY 桥切换为 FunASR WebSocket（online + 客户端 VAD）。导航 latency 仍偏高，仅作 Q&A 实验保留。**

```
浏览器 VAD → PCM → FunASR WS(:10095) → partial → matchNavFromPartial → mp3
句末 is_speaking:false → final；无结果时 batch REST DashScope 兜底
```

| 组件 | 文件 | 作用 |
|------|------|------|
| FunASR WS | `voice-service/funasr_ws_server.py` | paraformer-online 流式识别 |
| 旧 DashScope 桥 | `voice-service/ws_asr_bridge.py` | 仅 `ASR_STREAM=dashscope` 时启用 |
| 前端客户端 | `frontend/lib/funasr-stream.ts` | FunASR 协议 + 长连接 |
| 采集/VAD | `frontend/lib/voice.ts` | energy VAD + pre-roll + commit |
| 投机匹配 | `frontend/lib/nav-speculative.ts` | `matchNavFromPartial()` |

## 环境变量

**voice-service/.env**

```env
ASR_BACKEND=dashscope          # batch REST 兜底
ASR_STREAM=funasr              # funasr | dashscope | off
VOICE_WS_PORT=10095
FUNASR_DEVICE=cpu
```

**frontend/.env.local**

```env
NEXT_PUBLIC_VOICE_ASR=stream
NEXT_PUBLIC_VOICE_WS_URL=ws://127.0.0.1:10095
NEXT_PUBLIC_NAV_FAST=true
NEXT_PUBLIC_VAD_SILENCE_MS=400
```

## 安装（首次）

```powershell
cd big-screen/voice-service
install-funasr.bat    # pip install torch + funasr
start.bat             # 日志应含 FunASR WS ws://127.0.0.1:10095
```

首次识别会从 ModelScope 下载流式模型（需联网一次）。

## 验收 TC-5

| ID | 操作 | 预期 |
|----|------|------|
| TC-5-1 | voice-service 日志 | `FunASR WS ws://127.0.0.1:10095` |
| TC-5-2 | 说「普法宣传廊」 | debug 出现 `FunASR partial` → `partial 投机` → mp3 ≤ ~1s |
| TC-5-3 | 说「模拟药店」 | partial 或 final 进 pharmacy |
| TC-5-4 | `NEXT_PUBLIC_VOICE_ASR=batch` | 无 WS，仅 REST |
| TC-5-5 | FunASR 未安装 | 明确报错 + batch 兜底仍可识别 |

## 常见问题

**FunASR 未就绪**

- 运行 `install-funasr.bat`
- 重启 `start.bat`
- Windows 用 `127.0.0.1` 不用 `localhost`

**仍走 batch 兜底**

- 看 voice-service 是否有 `[funasr_ws] partial:` 日志
- 无 partial → 检查模型是否下载完成、麦克风 PCM 是否送到 WS

**回退 DashScope 流式（不推荐）**

```env
ASR_STREAM=dashscope
VOICE_WS_PORT=8001
NEXT_PUBLIC_VOICE_WS_URL=ws://127.0.0.1:8001
```
