# Step 0 · 环境与网络验收

> **你要完成的事**：把「三套网络 + 两套配置文件」准备好，确保 Step 1 写代码时不会卡在环境上。  
> **预计时间**：0.5～1 天（含注册阿里云、申请 Key、连公司内网）

---

## 一、本 Step 在整体方案里的位置

```
Step 0  环境与网络  ← 你在这里
Step 1  Dify 问答接入 page.tsx
Step 2  CosyVoice 动态 TTS
Step 3  DashScope ASR
...
```

Step 0 **不写业务功能**，只打地基。地基有三层：

| 层 | 是什么 | 本项目里谁用 |
|----|--------|--------------|
| 本机环回 | `127.0.0.1:8000` | voice-service（Python 语音服务） |
| 公网 API | 阿里云 DashScope | 以后的流式 ASR/TTS |
| 公司内网 | `zkt.medlibbot.com:8380` | Dify 知识库问答 |

---

## 二、必懂概念（新手向）

### 2.1 环境变量 `.env` 是什么？

程序启动时从文件或系统里读取 `KEY=VALUE`，用来放 **密钥和开关**，避免写死在代码里、避免提交到 Git。

| 文件 | 谁读 | 提交 Git？ |
|------|------|------------|
| `frontend/.env.local` | Next.js（Node） | **否**（已在 .gitignore） |
| `voice-service/.env` | `server.py` 启动时 | **否**（已加 .gitignore） |
| `*.env.example` | 给人复制用的模板 | **是**（不含真实 Key） |

**规则**：

- 以 `NEXT_PUBLIC_` 开头的变量会打进**浏览器**代码 → **不要**放 API Key。
- `DASHSCOPE_API_KEY` 只放在 `voice-service/.env`，由 Python 服务端调用阿里云。

### 2.2 三种「联网」别搞混

| 说法 | 含义 | 需要 Clash？ |
|------|------|--------------|
| 连 WiFi 能上网 | 访问 `dashscope.aliyuncs.com` | **不需要** |
| 公司内网 | 访问 Dify `zkt.medlibbot.com:8380` | 不需要；要连单位网络/VPN |
| 本机服务 | `127.0.0.1:8000` | 与 WiFi 无关 |

`dev.sh` 里写了 `NO_PROXY=127.0.0.1`：防止 Clash 把访问本机 voice-service 的请求误发到代理。

### 2.3 前端 → 语音服务 → 云端 的分工

```
浏览器
  → fetch /api/voice        → Next.js (frontend/app/api/voice/route.ts)
       → fetch 127.0.0.1:8000/asr  → voice-service (server.py)
            → （Step 3+）DashScope Fun-ASR
```

Next.js 的 `/api/*` 路由跑在 **Node 服务端**，所以可以安全读 `DIFY_API_KEY`；浏览器永远看不到这些 Key。

### 2.4 `ASR_BACKEND` / `TTS_BACKEND`

voice-service 里的**开关**，决定「听」和「说」用哪套引擎：

| 值 | 含义 | Step 0 状态 |
|----|------|-------------|
| `vosk` / `piper` | 离线本地模型 | 当前默认可用 |
| `dashscope` | 阿里云 | Step 0 只配 Key；Step 2/3 写代码后才真能调用 |

Step 0 把 `.env` 配成 `dashscope` 时，若尚未实现 dashscope 分支，**ASR 仍可能 501**——这是正常的，Step 3 会修。

---

## 三、跟代码走读（Step 0 改动了什么）

### 3.1 `voice-service/server.py` — 自动读 `.env`

```python
def _load_dotenv():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    ...

_load_dotenv()   # 必须在读 ASR_BACKEND 之前执行

ASR_BACKEND = (os.environ.get("ASR_BACKEND") or "vosk").lower()
DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY") or ""
```

**学习点**：配置读取顺序 = 先加载 `.env` → 再 `os.environ.get`。Python 进程里环境变量是全局字典。

### 3.2 `/health` — 验收用诊断

启动 voice-service 后访问：

```bash
curl http://127.0.0.1:8000/health
```

应看到类似：

```json
{
  "ok": true,
  "asr_backend": "dashscope",
  "tts_backend": "dashscope",
  "dashscope_key_configured": true,
  "vosk_model": true,
  "piper_model": true
}
```

- `dashscope_key_configured: false` → Key 未填或仍是 `sk-xxx` 占位符。
- `asr_backend: vosk` → 没有 `.env` 或 ASR_BACKEND 未设置。

### 3.3 `frontend/.env.local.example` — 前端模板

Step 0 新增：

```env
NEXT_PUBLIC_VOICE_ASR=batch      # 以后改 stream
NEXT_PUBLIC_VAD_ENGINE=energy    # Step 4 改 silero
```

Dify 相关 Step 1 就要用：

```env
DIFY_API_BASE=http://zkt.medlibbot.com:8380/v1
DIFY_API_KEY=app-xxx
```

### 3.4 验收脚本

`big-screen/scripts/verify-step0.ps1` 自动检查：

1. DashScope 公网  
2. Dify 内网  
3. voice-service health  
4. 两个 `.env` 文件是否存在  

---

## 四、动手清单（按顺序做）

### 4.1 阿里云百炼（公网 API Key）

详细图文步骤见 **[step-00-附录-百炼开通指南](step-00-附录-百炼开通指南.md)**。摘要：

1. 登录 [百炼控制台](https://bailian.console.aliyun.com/)（需阿里云实名账号）
2. **设置 → API-Key** → 若提示未开通，先 **开通模型服务**（可领免费额度）
3. **创建 API Key** → 归属选「默认业务空间」→ 权限选「全部」
4. **立即复制** `sk-` 开头的 Key（关闭后无法再查看明文）
5. 写入 `voice-service/.env` 的 `DASHSCOPE_API_KEY`

**不需要**在百炼里创建「多模态应用」；我们代码直接调 DashScope API。

### 4.2 配置 voice-service

```powershell
cd E:\xiaozhi-Requirement\big-screen\voice-service
copy .env.example .env
# 用编辑器打开 .env，把 DASHSCOPE_API_KEY 改成真实 sk-...
```

确认 `.env` 内容类似：

```env
ASR_BACKEND=dashscope
TTS_BACKEND=dashscope
DASHSCOPE_API_KEY=sk-你的真实Key
```

### 4.3 配置 Next.js 前端

```powershell
cd E:\xiaozhi-Requirement\big-screen\frontend
copy .env.local.example .env.local
# 填写 DIFY_API_KEY（Step 1 必需）
```

Dify Key 获取：登录内网 Dify → 你的应用 → **API 访问** → 创建 API 密钥。

### 4.4 Dify 应用：增加 `scene` 变量（Step 1 会用）

1. 打开 Dify 应用编排
2. **变量** → 添加输入变量 `scene`，类型 **文本**
3. 在系统提示词里写一句：`当前参观场景：{{scene}}`（welcome / corridor / pharmacy）

Step 0 只配置，Step 1 代码里会传 `scene: nav.scene`。

### 4.5 启动服务并验收

**终端 1 — voice-service：**

```powershell
cd E:\xiaozhi-Requirement\big-screen\voice-service
.\start.bat
```

看到 `http://127.0.0.1:8000 (tts=..., asr=...)` 即成功。

**终端 2 — 前端：**

```powershell
cd E:\xiaozhi-Requirement\big-screen\frontend
npm run dev
```

**终端 3 — 跑验收：**

```powershell
powershell -ExecutionPolicy Bypass -File E:\xiaozhi-Requirement\big-screen\scripts\verify-step0.ps1
```

### 4.6 手动 curl（理解 HTTP 诊断）

```powershell
# 1. 公网
curl -I https://dashscope.aliyuncs.com

# 2. 内网 Dify（需连公司网）
curl -I http://zkt.medlibbot.com:8380

# 3. 本机语音
curl http://127.0.0.1:8000/health

# 4. Next 代理健康（需 npm run dev）
curl http://localhost:3000/api/voice/health
```

---

## 五、Step 0 验收标准（TC-0）

| ID | 检查项 | 通过标准 |
|----|--------|----------|
| TC-0-1 | voice-service | `/health` 返回 `ok:true` |
| TC-0-2 | DashScope Key | `dashscope_key_configured:true` |
| TC-0-3 | Next 代理 | `/api/voice/health` → `reachable:true` |
| TC-0-4 | Dify 内网 | curl 非连接拒绝（502/404 可接受，说明能连上服务器） |
| TC-0-5 | 配置文件 | `.env.local` 与 `voice-service/.env` 存在且非占位 Key |

**Step 0 完成标志**：验收脚本 0 失败，或仅 Dify 内网失败（你在家未连 VPN 时可暂记「待进场补测」）。

---

## 六、常见问题 FAQ

### Q1：`verify-step0.ps1` 报 DashScope 失败

- 检查 WiFi 能否打开网页
- 公司网络是否拦截 `*.aliyuncs.com`
- **不需要**开 Clash 访问 DashScope

### Q2：`127.0.0.1:8000` 连接失败

- 是否运行了 `start.bat`
- `start.bat` 里 Python 路径是否存在（需先跑过 `download_models.bat`）
- 端口 8000 是否被占用

### Q3：设置了 `ASR_BACKEND=dashscope` 但语音识别报错

**正常**。DashScope ASR 代码在 **Step 3** 才实现。Step 0～2 期间可临时改回：

```env
ASR_BACKEND=vosk
TTS_BACKEND=piper
```

### Q4：Dify 在家连不上

客户文档写明需 **公司内网**。Step 1 开发 Dify 问答时需连 VPN 或到公司网络；Step 0 可标记「待测」继续其他项。

### Q5：为什么 Key 分两个文件？

| Key | 文件 | 原因 |
|-----|------|------|
| `DASHSCOPE_API_KEY` | voice-service/.env | Python 直接调阿里云 |
| `DIFY_API_KEY` | frontend/.env.local | Next.js `/api/chat` 调 Dify |

职责分离，以后换部署方式时互不影响。

### Q6：`.env` 改了要不要重启？

**要**。环境变量在进程启动时读入；改 `.env` 后重启 `start.bat` 和 `npm run dev`。

---

## 七、本 Step 小结（内化检查）

做完 Step 0，你应该能回答：

1. 本项目语音数据流经过哪几个进程？（浏览器 → Next → voice-service → 可选云端）
2. 为什么 API Key 不能写在 `NEXT_PUBLIC_` 变量里？
3. `127.0.0.1` 和 `dashscope.aliyuncs.com` 分别解决什么问题？
4. `/health` 里 `dashscope_key_configured` 为 false 说明什么？

---

## 八、下一步

Step 0 通过后 → [方案 A 实施指南 Step 1](../design/方案A-语音混合架构-实施指南.md#step-1--dify-问答闭环blocking1-天)

我们将：

- 新建 `lib/dify-client.ts`
- 改 `page.tsx` 的 `handleUser`，把知识问答接到 `/api/chat`
- 配套学习文档：`step-01-Dify问答闭环.md`（实施时创建）

---

## 附录：Step 0 新增/修改文件清单

| 文件 | 作用 |
|------|------|
| `voice-service/.env.example` | 语音服务配置模板 |
| `voice-service/.gitignore` | 忽略 `.env` |
| `voice-service/server.py` | 加载 `.env` + health 增强 |
| `voice-service/start.bat` | 提示使用 `.env` |
| `frontend/.env.local.example` | 前端配置模板（含方案 A 开关） |
| `scripts/verify-step0.ps1` | 一键验收 |
| `docs/learn/README.md` | 学习文档索引 |
