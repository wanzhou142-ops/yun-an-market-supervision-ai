# Step 3 · DashScope ASR（Fun-ASR REST）

> **目标**：麦克风识别换云端 Fun-ASR，准确率与延迟优于 Vosk small；架构仍是「录完一段 WAV → POST /asr」批处理。

---

## 改动文件

| 文件 | 改动 |
|------|------|
| `voice-service/dashscope_asr.py` | **新建** 本地 WAV → `Recognition.call()` 非流式识别 |
| `voice-service/server.py` | `ASR_BACKEND=dashscope` 分支；`/asr-test` 支持 dashscope |
| `voice-service/.env.example` | Step 3 推荐配置 |

前端 **无需改**：仍 POST 16k 单声道 WAV 到 `/api/voice`。

---

## 配置

在 `voice-service/.env`：

```env
ASR_BACKEND=dashscope
TTS_BACKEND=dashscope
DASHSCOPE_API_KEY=sk-你的Key
DASHSCOPE_ASR_MODEL=fun-asr-realtime
DASHSCOPE_ASR_LANGUAGE=zh
DASHSCOPE_TTS_MODEL=cosyvoice-v3-flash
DASHSCOPE_TTS_VOICE=longanhuan
```

**离线回退**（无外网时）：

```env
ASR_BACKEND=vosk
TTS_BACKEND=piper
```

---

## 启动与验收

```powershell
cd big-screen\voice-service
.\start.bat
```

启动行应显示：`tts=dashscope, asr=dashscope`

### 1. Health

```powershell
curl http://127.0.0.1:8000/health
```

预期：

- `asr_backend`: `"dashscope"`
- `dashscope_key_configured`: `true`
- `dashscope_asr_model`: `"fun-asr-realtime"`

### 2. ASR 自测（无需麦克风）

```powershell
curl http://127.0.0.1:8000/asr-test
```

预期：`text` 含「你好」或「安安」（Piper 合成音 + 云端识别）。

### 3. 大屏 TC-3（真人麦克风）

| 说 | 预期 |
|----|------|
| 「去宣传廊」 | 导航 → corridor |
| 「模拟药店」 | 导航 → pharmacy |
| 「器械区」 | aspect device |
| 「药品和非药品怎么区分」 | Dify 问答（识别比 Vosk 更准） |

控制台应出现类似：`ASR: "去宣传廊" → nav`

---

## 常见问题

### Q1：`未知 ASR_BACKEND=dashscope`

- 确认已拉最新代码、`dashscope_asr.py` 存在
- **重启** `start.bat`（改 `.env` 后必须重启）

### Q2：`.env` 改了不生效

只改**无 `#` 的生效行**，例如：

```env
ASR_BACKEND=dashscope   # 正确
# ASR_BACKEND=vosk      # 这是注释，不会生效
```

### Q3：识别报错 `DASHSCOPE_API_KEY 未配置`

复制 `.env.example` → `.env`，填入百炼 Key（与 Step 2 TTS 同一把 Key）。

### Q4：想临时回退 Vosk

`.env` 改 `ASR_BACKEND=vosk`，重启 voice-service。TTS 仍可保持 `dashscope`。

---

## 下一步

**Step 4 · Silero VAD**：停嘴等待 700ms → ~350ms。

**Step 5 · 流式 ASR + partial 导航投机**：导航接近 0 延迟（WebSocket 桥接）。
