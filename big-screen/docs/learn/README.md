# 方案 A · 边做边学

> 与 [方案A-语音混合架构-实施指南](../design/方案A-语音混合架构-实施指南.md) 逐步对应。  
> 每完成一步，读对应学习文档 + 跑验收脚本/用例。

| Step | 学习文档 | 实施指南章节 | 验收 |
|------|----------|--------------|------|
| **0** | [step-00-环境与网络验收](step-00-环境与网络验收.md) · [百炼开通附录](step-00-附录-百炼开通指南.md) | Step 0 | `scripts/verify-step0.ps1` |
| **1** | [step-01-Dify问答闭环](step-01-Dify问答闭环.md) | Step 1 | TC-1 |
| **2** | [step-02-CosyVoice动态TTS](step-02-CosyVoice动态TTS.md) | Step 2 | TC-2 |
| 3 | [step-03-DashScope-ASR.md](step-03-DashScope-ASR.md) | Step 3 | TC-3 |
| 4 | [step-04-Silero-VAD.md](step-04-Silero-VAD.md) | Step 4 | TC-4 |
| 5 | [step-05-流式ASR与投机导航.md](step-05-流式ASR与投机导航.md) | Step 5 | TC-5 |
| 6 | [step-06-流式问答.md](step-06-流式问答.md) | Step 6 | TC-6 |
| 7 | step-07-打断问询（待写） | Step 7 | 可选 |

## 怎么用

1. 按 Step 顺序做，**不要跳步**（后面依赖前面的 env 和网络）。
2. 每步文档结构：**要做什么 → 必懂概念 → 跟代码走读 → 动手清单 → 常见问题**。
3. 卡住时：先看该 Step 文档末尾 FAQ，再看 debug 面板 / 验收脚本输出。
