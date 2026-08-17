# 附录 · 阿里云百炼开通与 API Key 操作指南

> 配合 [step-00-环境与网络验收](step-00-环境与网络验收.md) 使用。  
> 官方文档：[获取 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)

---

## 你需要从百炼拿到什么？

对本项目（方案 A）而言，**只需要一样东西**：

```
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
```

Fun-ASR（听）和 CosyVoice（说）共用这一把 Key，通过 HTTP/WebSocket 调 `dashscope.aliyuncs.com`，**不需要**在百炼里单独创建「多模态应用」（那是给别人用控制台搭对话产品的；我们代码里自己接 API）。

Dify 知识问答是**另一套**（公司内网 `zkt.medlibbot.com`），与百炼无关。

---

## 第一步：准备阿里云账号

1. 打开 [阿里云官网](https://www.aliyun.com/)
2. 注册账号并完成 **实名认证**（个人或企业均可）
3. 确保账号能正常登录

未实名认证时，百炼往往无法开通模型服务或创建 API Key。

---

## 第二步：进入百炼控制台

**推荐入口（中国大陆）：**

```
https://bailian.console.aliyun.com/
```

或：

```
https://bailian.console.aliyun.com/cn-beijing#/home
```

登录后会进入百炼首页。首次进入通常会弹出 **《服务协议》**，勾选同意并开通百炼平台。

---

## 第三步：开通「模型服务」（必做）

没有这一步，「创建 API Key」按钮会是灰色或提示「还未开通模型服务」。

**操作路径（界面可能微调，找类似字样即可）：**

1. 点击右上角 **设置** 图标（齿轮）
2. 左侧选 **API-Key**
3. 若提示未开通模型服务：
   - 鼠标移到 **创建 API Key** 上，点 **去开通**
   - 或首页弹窗 **确认开通，并领取免费额度**
4. 勾选协议 → **确认开通**

说明：

- 开通后按量计费；新账号常有免费额度（额度以控制台显示为准）
- 语音识别约 **0.00022 元/秒**，合成约 **2 元/万字符**，展厅用量通常很低

---

## 第四步：创建并复制 API Key

1. 仍在 **设置 → API-Key** 页面
2. 点击 **创建 API Key**
3. 弹窗填写：
   | 字段 | 建议 |
   |------|------|
   | 归属账号 | 选你的主账号（一串数字的阿里云账号） |
   | 归属业务空间 | **默认业务空间** |
   | 权限 | **全部**（开发阶段最简单；上线后可改自定义） |
4. 点 **确定**
5. **立刻复制** 以 `sk-` 开头的完整密钥

⚠️ **关闭弹窗后无法再看到明文 Key**，丢失只能删除重建。

---

## 第五步：确认地域（重要）

语音模型与地域有关。控制台右上角有地域选择：

- 大陆开发一般选 **华北2（北京）** / `cn-beijing`
- API 调用端点通常为：`https://dashscope.aliyuncs.com`

若 Key 是在北京地域创建的，后续代码里默认即可；换地域可能导致部分模型不可用。

---

## 第六步：可选 — 在控制台试听模型

不必须，但有助于建立直觉：

1. 百炼首页 → **模型体验** / **语音**
2. 或直接打开体验中心（ASR）：
   ```
   https://bailian.console.aliyun.com/?tab=model#/efm/model_experience_center/voice
   ```
3. 可试：
   - **Fun-ASR 实时语音识别** — 对应我们以后的「听」
   - **CosyVoice** — 对应我们以后的「动态说」

能在这里识别/合成成功，说明账号和计费已通，API Key 一般也能用。

---

## 第七步：写入本项目配置

### 7.1 voice-service（DashScope Key 放这里）

```powershell
cd E:\xiaozhi-Requirement\big-screen\voice-service
copy .env.example .env
notepad .env
```

编辑 `.env`：

```env
ASR_BACKEND=dashscope
TTS_BACKEND=dashscope
DASHSCOPE_API_KEY=sk-粘贴你刚复制的Key
DASHSCOPE_ASR_MODEL=fun-asr-realtime
DASHSCOPE_TTS_MODEL=cosyvoice-v3-flash
DASHSCOPE_TTS_VOICE=longxiaochun_v2
```

> **Step 0～2 说明**：Key 填好后，`/health` 会显示 `dashscope_key_configured: true`；但 ASR/TTS 真正调云端要等 Step 2/3 代码实现。开发期间若要用麦克风，可临时改回 `vosk` + `piper`。

### 7.2 验证 Key 是否被读取

```powershell
cd E:\xiaozhi-Requirement\big-screen\voice-service
.\start.bat
```

另开终端：

```powershell
curl http://127.0.0.1:8000/health
```

期望 JSON 中含：

```json
"dashscope_key_configured": true,
"asr_backend": "dashscope"
```

---

## 第八步：可选 — 配置热词（Step 5 再用）

导航词（宣传廊、模拟药店等）可在 Fun-ASR 请求里传 **即时热词** `vocabulary`，无需在控制台单独建页面。

若以后调用量很大，可在百炼文档里查「预编译热词列表」API 提前上传词表。Step 0 可跳过。

---

## 常见问题

### Q1：找不到「创建 API Key」

- 先完成 **开通模型服务**（第三步）
- 确认用的是 **主账号** 或具备管理员权限的子账号

### Q2：需要单独开通 Fun-ASR / CosyVoice 吗？

一般 **不需要** 逐个商品开通。开通百炼模型服务 + 有效 API Key 后，按模型 ID 调用即可；首次调用若失败，看返回错误是否提示「未开通」或「余额不足」。

### Q3：和 Dify 的 Key 混淆了？

| Key 样子 | 用途 | 配置文件 |
|----------|------|----------|
| `sk-...` | 阿里云 DashScope | `voice-service/.env` |
| `app-...` | Dify 应用 | `frontend/.env.local` |

### Q4：要不要开 Clash？

访问 `dashscope.aliyuncs.com` **不需要** 科学上网；普通 WiFi 即可。  
访问本机 `127.0.0.1:8000` 时，若 Clash 全局代理导致失败，参考 `frontend/dev.sh` 设置 `NO_PROXY`。

### Q5：免费额度用完了怎么办？

控制台 **费用 → 账单 / 资源包** 查看用量；可充值或购买语音资源包。展厅演示用量通常很小。

### Q6：CosyVoice 音色 `longxiaochun_v2` 在哪查？

官方音色列表：[CosyVoice 音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)  
方案 A 默认用系统女声；与预录 mp3（晓晓）接近，减少问答与导航音色差异。

---

## 自检清单

- [ ] 阿里云账号已实名
- [ ] 百炼平台已开通
- [ ] 模型服务已开通
- [ ] 已复制 `sk-` 开头的 API Key 到本地安全位置
- [ ] `voice-service/.env` 已配置 `DASHSCOPE_API_KEY`
- [ ] `curl http://127.0.0.1:8000/health` → `dashscope_key_configured: true`
- [ ] （可选）控制台语音体验中心能试玩 ASR/TTS

全部打勾 → Step 0 百炼部分完成，可继续配置 Dify 与跑 `verify-step0.ps1`。

---

## 官方链接

| 内容 | 链接 |
|------|------|
| 百炼控制台 | https://bailian.console.aliyun.com/ |
| 获取 API Key | https://help.aliyun.com/zh/model-studio/get-api-key |
| Fun-ASR 实时 WebSocket API | https://help.aliyun.com/zh/model-studio/fun-asr-realtime-websocket-api |
| CosyVoice 语音合成 | https://help.aliyun.com/zh/model-studio/tts-model |
| 模型价格 | https://help.aliyun.com/zh/model-studio/model-pricing |
