# 云安市场监管 AI 体验项目

云安项目包含**两条独立产品线**，共用一套普法知识库源文件。

| 目录 | 说明 |
|------|------|
| [`big-screen/`](big-screen/) | **普法大屏**：场景导览 + 数字人 + 本地语音（不接 RAG） |
| [`xiaozhi/`](xiaozhi/) | **小智机器人**：问学考、Dify 工作流、题库 |
| [`shared/knowledge-base/`](shared/knowledge-base/) | **共享知识库**：展区 docx、法规占位（小智导入用） |
| [`project/`](project/) | 跨产品线文档：总方案、进度、交付材料 |

## 快速入口

### 跑大屏

```bash
# 1. 语音服务（另开终端）
cd big-screen/voice-service
pip install -r requirements.txt
bash start.sh   # 或 start.bat

# 2. 前端
cd big-screen/frontend
npm install
bash dev.sh     # 勿直接用 npm run dev，见 启动说明.md
```

浏览器：`http://localhost:3000/?scene=welcome|corridor|pharmacy`

### 配小智

- Dify 工作流：`xiaozhi/dify/workflows/`
- 提示词：`xiaozhi/dify/prompts/`
- 知识库源文件：`shared/knowledge-base/` → 导入小智/Dify 平台

### 换视频文案

大屏播放用文案在 `big-screen/content/video-copy/`。

## 文档导航

- 大屏功能文档：[big-screen/docs/README.md](big-screen/docs/README.md)
- 小智配置说明：[xiaozhi/docs/](xiaozhi/docs/)
- 项目总方案：[project/overview/](project/overview/)

## 目录结构

```
xiaozhi-Requirement/
├── big-screen/
│   ├── frontend/          Next.js 大屏前端
│   ├── voice-service/     Vosk + Piper 本地语音
│   ├── assets/            数字人、背景、预览图
│   ├── scripts/tools/     资产处理脚本
│   ├── content/video-copy/  视频文案
│   └── docs/              大屏文档
├── xiaozhi/
│   ├── dify/              工作流 + 提示词
│   ├── question-bank/     题库
│   ├── examples/          RAG demo
│   └── docs/
├── shared/knowledge-base/
│   ├── zones/             展区知识 docx
│   └── regulations/       法规占位 txt
└── project/               总方案、进度、交付
```
