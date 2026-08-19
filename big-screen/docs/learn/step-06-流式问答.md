# Step 6 · Dify 流式 + TTS 预取

> **目标**：Dify 不必等全文（~9s）才出声；首句就绪即 CosyVoice；句间预取下一句。

---

## 改动

| 文件 | 说明 |
|------|------|
| `lib/dify.ts` | `streamFromDify()` SSE |
| `app/api/chat/route.ts` | `stream: true` → SSE |
| `lib/dify-client.ts` | `askDifyStreaming()` 按句回调 |
| `lib/sentence-stream.ts` | 流式文本切句 |
| `lib/voice.ts` | `beginTtsStream` / `pushTtsSentence` + TTS 预取 |
| `app/page.tsx` | 流式问答首句即播 |

---

## 配置（`.env.local`）

```env
NEXT_PUBLIC_DIFY_STREAM=true
```

关闭流式（回退 blocking）：`NEXT_PUBLIC_DIFY_STREAM=false`

---

## 验收

1. 重启 frontend
2. 问「药品和非药品怎么区分」
3. 控制台预期：
   - `Dify 问答中…`
   - **`Dify 首句就绪 → TTS`**（不必等 9s 全文）
   - `Dify 回答 N 字（流式）`
4. 体感：首句出声明显提前；多句时间隔缩短（预取）

---

## 尚未做（方案 A 后续）

- CosyVoice **WebSocket 真流式** TTS（`/tts/stream`）→ 可再压句内延迟
- Step 5 流式 ASR + partial 导航
