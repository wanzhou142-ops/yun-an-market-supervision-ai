# 小智机器人（问学考）

小智平台负责**知识问答、刷题、考试**，与大屏的导览+语音交互是两条独立产品线。

## 目录

| 路径 | 说明 |
|------|------|
| `dify/workflows/` | Dify 训练/考试工作流 YAML |
| `dify/prompts/` | 场景分流、问学考提示词 |
| `question-bank/` | 考题 docx 历史副本 + demo 数据（**源文件以 `shared/knowledge-base/zones/` 为准**） |
| `scripts/` | 工作流修复脚本（如 `fix_training_flow.py`） |
| `examples/rag_demo/` | RAG 本地 demo |
| `docs/` | 小智配置说明 |

## 知识库

展区知识源文件在 [`../shared/knowledge-base/`](../shared/knowledge-base/)，导入 Dify/小智平台后用于 RAG。

## 与大屏的关系

- **共用**：`shared/knowledge-base/` 里的普法内容
- **不共用**：大屏代码（`big-screen/`）、语音服务、数字人资产
- 大屏不接 `/api/chat`，事实类问题由小智侧回答
