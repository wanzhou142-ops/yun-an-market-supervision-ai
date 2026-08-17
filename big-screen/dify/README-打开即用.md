# Dify Chatflow 阶段 B · 打开即用

> **DSL 版本：0.5.0**（与当前内网 Dify 一致，可直接导入）  
> 文件：`big-screen/dify/workflows/普法助手-阶段B.yml`

---

## 最快路径（约 10 分钟）

### 1. 导入 Chatflow

1. 浏览器打开内网 Dify（`zkt.medlibbot.com:8380`）
2. **工作室** → 右上角 **导入 DSL**
3. 选择本文件：

   ```
   big-screen/dify/workflows/普法助手-阶段B.yml
   ```

4. 导入成功后打开应用 **「云安区市场监管普法助手-阶段B」**

### 2. 建知识库并上传文档

**方式 A（推荐，自动）** — 在公司内网 PowerShell 执行：

```powershell
cd E:\xiaozhi-Requirement\big-screen\dify\scripts
$env:DIFY_API_BASE = "http://zkt.medlibbot.com:8380/v1"
$env:DIFY_API_KEY  = "app-你的Key"   # 先用旧应用 Key 也行，建库不绑应用
.\setup-kb.ps1
```

脚本会创建 **5 个**知识库并上传 `shared/knowledge-base/zones/` 下全部 docx。

**方式 B（手工）** — 在 Dify **知识库** 菜单新建 **5 个**（无兜底库）：

| 知识库名 | 上传文件 |
|----------|----------|
| KB-welcome-序厅 | 序厅1、序厅2 docx |
| KB-corridor-cosmetic | 化妆品展区 科普/法规/案例 docx |
| KB-corridor-drug | 药品展区 三篇 docx |
| KB-corridor-device | 器械展区 三篇 docx |
| KB-pharmacy | 模拟药店简介 docx |

等全部索引状态为 **已完成**。

### 3. 挂知识库到检索节点

打开 Chatflow 画布，逐一点开 **知识检索** 节点，选择知识库：

| 节点标题 | 挂哪个库 |
|----------|----------|
| 检索-序厅 | KB-welcome |
| 检索-模拟药店 | KB-pharmacy |
| 检索-化妆品区 | KB-corridor-cosmetic |
| 检索-药品区 | KB-corridor-drug |
| 检索-器械区 | KB-corridor-device |
| 检索-宣传廊三库 | **同时勾选** cosmetic + drug + device **三个库**（见下节） |

> **「宣传廊三库」不是第 6 个知识库。** 用户在宣传廊总览（aspect 为空）时，该节点一次检索三个专区库。Top K 建议 **6**。

### 3.1 宣传廊三库挂库说明

触发条件：`scene=corridor` 且 `aspect` 为空（还没选化妆/药品/器械专区）。

在 **检索-宣传廊三库** 节点 → 知识库 → **多选**：

1. `KB-corridor-cosmetic-化妆品`
2. `KB-corridor-drug-药品`
3. `KB-corridor-device-器械`

**不需要**再上传额外 docx，也**不需要**把 9 篇合并成一个库。

### 4. 发布 & 配 Key

1. 右上角 **发布**
2. **API 访问** → 复制 API Key
3. 写入 `big-screen/frontend/.env.local`：

```env
DIFY_API_BASE=http://zkt.medlibbot.com:8380/v1
DIFY_API_KEY=app-xxxxxxxx
```

4. 重启前端 `npm run dev`

---

## 流程图（导入后画布应长这样）

```
开始(scene/aspect/chapter)
    → IF scene
        welcome  → 检索序厅     → LLM → 回复
        pharmacy → 检索药店     → LLM → 回复
        corridor → IF aspect
            cosmetic → 检索化妆区 → LLM → 回复
            drug     → 检索药品区 → LLM → 回复
            device   → 检索器械区 → LLM → 回复
            ELSE     → 检索三库   → LLM → 回复
```

---

## API 自测（发布后立即测）

```powershell
$body = @{
  inputs = @{
    scene = "corridor"
    aspect = "drug"
    chapter = "law"
  }
  query = "药品标签有哪些强制要求？"
  response_mode = "blocking"
  user = "test"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
  -Uri "http://zkt.medlibbot.com:8380/v1/chat-messages" `
  -Headers @{ Authorization = "Bearer app-你的Key"; "Content-Type" = "application/json" } `
  -Body $body
```

应返回 `answer` 字段含法规内容。

---

## 开始节点变量（已配好）

| 变量 | 类型 | 必填 | 合法值 |
|------|------|------|--------|
| scene | 下拉 | 是 | welcome / corridor / pharmacy |
| aspect | 下拉 | 否 | 空 / cosmetic / drug / device |
| chapter | 下拉 | 否 | 空 / science / law / casePick / case1 / case2 |

大屏 `NavState` 的 `null` 会传空字符串 `""`。

---

## 常见问题

**Q：导入后 LLM 报模型找不到？**  
检查 Dify 是否已安装 **通义 / DeepSeek V3** 插件；或把各 LLM 节点模型改成你环境里有的（如 qwen-max）。

**Q：检索节点报 dataset_ids 无效？**  
占位 ID 无效是正常的，按 §3 手工选库即可。

**Q：和旧「聊天助手」应用关系？**  
这是新 Chatflow 应用，Key 不同；`.env.local` 换成新应用的 API Key。

**Q：想覆盖旧应用名？**  
导入后可在应用设置里改名为「云安区市场监管普法助手」，或删旧应用避免混淆。

---

## 相关代码（已对接）

- `frontend/lib/dify.ts` — 传 `scene, aspect, chapter`
- `frontend/lib/dify-client.ts` — 浏览器调 `/api/chat`
- `frontend/app/api/chat/route.ts` — 服务端转发
