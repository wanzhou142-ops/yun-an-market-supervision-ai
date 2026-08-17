# Step 1 · Dify 知识问答闭环

> **你要完成的事**：用户问法规/科普类问题 → 走 Dify 知识库 → 数字人播报答案；说「去宣传廊」仍走导航预录。  
> **前置**：Step 0 完成（`voice-service` 健康；`frontend/.env.local` 已填 `DIFY_API_KEY`）

---

## 一、本 Step 在方案里的位置

```
用户说话 → ASR 文字 → classify() 分流
    ├─ nav      → navigateTo → 预录 mp3     （不变）
    ├─ training → training.pointer          （不变）
    ├─ chat / 问句 → askDify → Piper/CosyVoice 播答案  ← Step 1 新增
    └─ 其他     → global.fallback
```

Step 1 用 **blocking** 模式（等 Dify 全文返回再播），Step 6 再改流式。

---

## 二、必懂概念

### 2.1 为什么 Key 放服务端？

```
浏览器  →  fetch("/api/chat")  →  Next.js route.ts  →  Dify
                ↑                      ↑
           没有 Key              读 .env.local 里的 DIFY_API_KEY
```

若把 Key 写在 `NEXT_PUBLIC_DIFY_API_KEY`，会打进前端 JS，任何人 F12 都能看到。**密钥只放 `.env.local`，由 Route Handler 代发。**

### 2.2 `classify` vs `isQuestionText`

| 函数 | 作用 |
|------|------|
| `classify(text, nav)` | 规则匹配 **导航口令**（去宣传廊、药品区等） |
| `isQuestionText(text)` | 判断是否 **像问句**（什么、怎么、吗、？） |

**顺序很重要**：先 `classify`，导航优先；只有 `unknown` 且像问句才问 Dify。  
避免「去模拟药店」被当成问题。

### 2.3 `conversationId` 多轮对话

Dify 用 `conversation_id` 串上下文。大屏用 `convIdRef` 保存：

- 同一访客连续提问 → 带上下文
- `exitToVideo()` 回待机 → 清空，下次重新开聊

### 2.4 `loading` 状态

问 Dify 要 2～8 秒。期间：

- 状态栏显示 **「正在思考…」**
- 禁止重复开麦（`startListening` 检查 `loading`）
- 空闲超时不计时（与 `speaking` 同理）

---

## 三、跟代码走读

### 3.1 新建 `lib/dify-client.ts`

浏览器专用薄封装，只调自家 `/api/chat`：

```ts
export async function askDifyBlocking(message, scene, conversationId)
```

**学习点**：`lib/dify.ts` 是 **服务端**（Node 里调 Dify）；`dify-client.ts` 是 **浏览器**（调 Next API）。分层清晰。

### 3.2 `lib/tour-nav.ts` — `isQuestionText`

```ts
export function isQuestionText(raw: string): boolean {
  // ？结尾、含「什么/怎么/区别」、以「吗/呢」结尾 …
}
```

可按现场误触发情况增删关键词。

### 3.3 `app/page.tsx` — `handleUser` 分流

```ts
if (intent.kind === "nav") { navigateTo(...); return; }

if (intent.kind === "chat" || (intent.kind === "unknown" && isQuestionText(text))) {
  void askDify(text);
  return;
}

aiSay(script("global.fallback"));
```

`chat` 来自 classify 里「你好/谢谢/安安」；问句走 `unknown + isQuestionText`。

### 3.4 `askDify` 流程

```ts
setLoading(true)
→ askDifyBlocking(text, nav.scene, convIdRef.current)
→ 保存 conversationId
→ aiSay(answer)   // 动态文本，走 Piper 兜底（Step 2 换 CosyVoice）
→ setLoading(false)
```

失败时 debug 面板显示 `⚠️ Dify: ...`，播 `global.fallback`。

### 3.5 已有 `/api/chat/route.ts`

无需改（Step 1）。它读 `DIFY_API_KEY`、`DIFY_API_BASE`，调 `sendToDify()`，传 `scene` 给 Dify `inputs`。

---

## 四、Dify 控制台配置（你要做）

1. 打开内网 Dify → 你的**聊天助手 / Chatflow** 应用  
2. **变量** → 添加输入变量 **`scene`**（文本）  
3. 系统提示词加一句，例如：  
   `当前参观者所在场景：{{scene}}（welcome=迎宾, corridor=宣传廊, pharmacy=模拟药店）。请基于知识库回答市场监管法规问题，口语化，30–60 秒以内。`  
4. **知识库** 挂好序厅、宣传廊、药店相关 docx  
5. **API 访问** → 复制 Key → 写入 `frontend/.env.local` 的 `DIFY_API_KEY`

---

## 五、动手验收（TC-1）

### 5.1 启动

```powershell
# 终端 1：语音（若 ASR 未实现 dashscope，.env 里 ASR_BACKEND=vosk）
cd big-screen\voice-service
.\start.bat

# 终端 2：前端（需公司内网或 VPN 连 Dify）
cd big-screen\frontend
npm run dev
```

浏览器打开 `http://localhost:3000`，进入互动。

### 5.2 测试用例

| ID | 你说 / 输入 | 预期 |
|----|-------------|------|
| TC-1-1 | 「药品和非药品怎么区分？」 | debug: `→ unknown` 或问句；`Dify 问答中…`；播法规答案 |
| TC-1-2 | 「去模拟药店」 | debug: `→ nav`；切场景；**不**出现 Dify |
| TC-1-3 | 「你好安安」 | debug: `→ chat`；Dify 简短回复 |
| TC-1-4 | 「巴拉巴拉」 | `global.fallback` 预录 |
| TC-1-5 | 连续问两个相关问题 | 第二问能带上文（conversationId 保留） |

### 5.3 没有麦克风时怎么测？

Step 3 前若 ASR 不可用，可临时在浏览器控制台模拟（仅开发）：

```js
// 在 React DevTools 找不到 handleUser 时，用 API 直测 Dify：
fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "药品和非药品怎么区分？", scene: "welcome" }),
}).then(r => r.json()).then(console.log)
```

应返回 `{ answer: "...", conversationId: "..." }`。

---

## 六、常见问题

### Q1：`⚠️ Dify: 服务器未配置 DIFY_API_KEY`

`.env.local` 未建或未填 Key；改完需 **重启** `npm run dev`。

### Q2：`502` / 连接超时

未连公司内网 / VPN，`zkt.medlibbot.com:8380` 不可达。在家只能测导航，问答待进场。

### Q3：Dify 回答了但音色是男声 Piper

正常。Step 2 会把动态 TTS 换成 CosyVoice。导航预录仍是 mp3。

### Q4：问句被当成 fallback

检查是否命中导航规则（如句中含「药品」被 classify 吸走）。可调整 `isQuestionText` 或 classify 优先级。

### Q5：`ASR_BACKEND=dashscope` 但麦克风报错

DashScope ASR 在 Step 3 才实现。开发期 `.env` 改 `ASR_BACKEND=vosk`。

---

## 七、本 Step 改动文件

| 文件 | 改动 |
|------|------|
| `lib/dify-client.ts` | **新建** 浏览器调 `/api/chat` |
| `lib/tour-nav.ts` | 新增 `isQuestionText()` |
| `app/page.tsx` | `askDify`、`handleUser` 分流、`convIdRef`、`loading` UI |

---

## 八、自检（内化）

1. 为什么导航和问答要走两条路？  
2. `conversationId` 存在哪、什么时候清空？  
3. `/api/chat` 和 `lib/dify.ts` 各在哪一层运行？  
4. 为什么问「去宣传廊」不能走 Dify？

---

## 九、下一步

Step 1 通过后 → **Step 2**：`voice-service` 接 CosyVoice，动态答案音色变顺。  
学习文档：`step-02-CosyVoice动态TTS.md`（实施时创建）。
