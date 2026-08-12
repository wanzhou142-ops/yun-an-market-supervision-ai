# 大屏一键启动包（dify-frontend 部署产物）

> 本文件夹由 `npm run build`（已开 `output: 'standalone'`）后，把 `.next/standalone` + `.next/static` + `public` 复制进来，再加启动脚本组成。
> 展机**无需 npm install、无需构建**，拷文件夹双击即跑。

> **注意（2026-08-04）**：当前大屏的迎宾/宣传廊/模拟药店三场景由前端规则（正则关键词 + 预设话术）驱动，**未调用 Dify**。下文的 `DIFY_API_KEY/BASE` 配置保留给后续扩展或与小智统一接口时使用；如现场只演示三场景导览，可暂不配置 Dify，但务必启动本机 `voice-service`（否则语音服务不可达）。

## 展机操作步骤（3 步，非技术人员也能做）

1. 把整个 `deploy` 文件夹拷到展机（普通 Windows 即可，需已装 Chrome）。
2. 复制 `.env.local.example` 为 `.env.local`，填入客户 Dify 的 `DIFY_API_KEY` 与 `DIFY_API_BASE`。
3. 双击 `start.bat`（Linux 跑 `./start.sh`）。
   - 自动启动服务 → 4 秒后拉起 Chrome **全屏（kiosk）** 打开迎宾大厅。
   - 无需装 Node（standalone 自带运行时）、无需手动按 F11。

## 注意事项
- **首次运行**需允许麦克风权限，并确认展机**联网**（语音识别 ASR 需外网）。
- 切换场景：改 `.env.local` 的 `SCENE`（welcome / corridor / pharmacy），或直接浏览器地址栏改 `?scene=xxx`。
- 升级 Next.js 修 CVE：在开发机 `npm install next@latest` 后重新 build 并替换本包。
- 换法规库 / 升模型（DeepSeek-V4）在 Dify 后台做，与本包无关。
- 背景视频（bg-*.mp4）为 B 档占位，上线前需换客户正式版。
