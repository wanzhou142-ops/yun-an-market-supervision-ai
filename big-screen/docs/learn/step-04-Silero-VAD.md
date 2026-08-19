# Step 4 · Silero VAD

> **目标**：停嘴等待 700ms → ~350ms（`redemptionMs` 可配）。

---

## 改动

| 文件 | 说明 |
|------|------|
| `frontend/package.json` | `@ricky0123/vad-web`、`onnxruntime-web` |
| `frontend/lib/voice.ts` | `NEXT_PUBLIC_VAD_ENGINE=silero` 分支 |
| `frontend/.env.local.example` | VAD 配置项 |

---

## 配置（`.env.local`）

```env
NEXT_PUBLIC_VAD_ENGINE=silero
NEXT_PUBLIC_VAD_SILERO_REDEMPTION_MS=350
```

回退能量 VAD：`NEXT_PUBLIC_VAD_ENGINE=energy`

---

## 验收

1. `npm install`（frontend 目录）
2. 重启 `npm run dev`
3. 麦克风说话，控制台应出现：`VAD(Silero): 检测到人声` → `VAD(Silero): 说完 redemption=350ms`
4. 短句「返回」：停嘴到提交 ASR 应明显快于 energy 模式的 700ms

**注意**：Silero 模型从 jsDelivr CDN 加载（需能访问外网加载 ONNX/WASM；加载一次后浏览器缓存）。

---

## 下一步

Step 5 · 流式 ASR + partial 导航投机；Step 6 · Dify 流式 + TTS 预取。
