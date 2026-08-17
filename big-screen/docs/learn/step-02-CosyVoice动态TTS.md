# Step 2 · CosyVoice 动态 TTS

> **目标**：Dify 动态答案用 CosyVoice 女声；导航预录 mp3 **不变**。

---

## 改动文件

| 文件 | 改动 |
|------|------|
| `voice-service/dashscope_tts.py` | **新建** CosyVoice 非流式合成 |
| `voice-service/server.py` | `TTS_BACKEND=dashscope` 分支 |
| `voice-service/requirements.txt` | 加 `dashscope>=1.20.0` |
| `voice-service/.env` | `TTS_BACKEND=dashscope`，`ASR_BACKEND=vosk` |

前端 **无需改逻辑**：无 tts-map 命中时仍调 `/api/voice/tts`，由 voice-service 后端决定 Piper 或 CosyVoice。

---

## 配置

```env
ASR_BACKEND=vosk
TTS_BACKEND=dashscope
DASHSCOPE_API_KEY=sk-你的Key
DASHSCOPE_TTS_MODEL=cosyvoice-v3-flash
DASHSCOPE_TTS_VOICE=longanhuan
```

> **音色**：`cosyvoice-v3-flash` 须配 **v3 音色**（如 `longanhuan`）。`longxiaochun_v2` 仅适用于 `cosyvoice-v2`。

---

## 安装与启动

```powershell
cd big-screen\voice-service
pip install dashscope>=1.20.0
# Ctrl+C 停旧进程后
.\start.bat
```

启动应显示：`tts=dashscope, asr=vosk`

---

## 验收 TC-2

| ID | 操作 | 预期 |
|----|------|------|
| TC-2-0 | `curl http://127.0.0.1:8000/health` | `tts_backend=dashscope` |
| TC-2-1 | 大屏问 Dify 一题 | **CosyVoice 女声**，非 Piper 男声 |
| TC-2-2 | 说「去宣传廊」 | 仍播 **预录 mp3**，不走云端 TTS |

### curl 直测 TTS

```powershell
$body = '{"text":"您好，我是云安普法助手安安。"}'
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/tts" `
  -ContentType "application/json" -Body $body -OutFile test.mp3
```

应生成可播放的 `test.mp3`。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `未知 TTS_BACKEND` | 重启 voice-service，确认 `.env` 无 `#` 注释掉 `TTS_BACKEND=dashscope` |
| `CosyVoice 未返回音频` | 检查 model/voice 是否匹配；换 `longanyang` 等 v3 音色试 |
| 仍是男声 | 动态文本才走 CosyVoice；导航话术走预录 mp3 |
| CosyVoice 失败 | 临时改 `TTS_BACKEND=piper` 回退 |

---

## 下一步

Step 3 · DashScope ASR（`ASR_BACKEND=dashscope`）
