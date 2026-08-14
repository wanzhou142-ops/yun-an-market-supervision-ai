# 云安市场监管普法大屏 · 项目文档导航

> 本目录是「云安市场监管普法大屏」数字人的**功能实现文档体系**，用于梳理已完成功能、记录实现流程/技术栈/踩坑，并作为学习笔记内化项目知识。
>
> 配套还有 [`project/`](../project/) 下的总方案与进度文档。小智问学考见 [`xiaozhi/`](../../xiaozhi/)。

## 一、系统总览（先看这个）

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器大屏 (Next.js 15 + React 19)  ← 你主要在改的部分      │
│  big-screen/frontend/                                          │
│   ├─ app/page.tsx      导览状态机 + 场景切换 + 语音编排       │
│   ├─ app/globals.css   所有动画/布局/数字人样式              │
│   ├─ lib/voice.ts      语音抽象层（麦克风录音→ASR→TTS）     │
│   ├─ lib/tts-map.json  固定话术→预录音频映射               │
│   └─ app/api/voice/*   ASR/TTS/Health 代理到本机语音服务   │
└───────────────────────────┬─────────────────────────────────┘
                             │ http://127.0.0.1:8000（同机 localhost）
┌───────────────────────────┴─────────────────────────────────┐
│  语音服务 (Python)  big-screen/voice-service/  ← 离线，不连外网│
│   ├─ server.py   FastAPI：/asr /tts /health /asr-test       │
│   ├─ models/vosk  Vosk 普通话小模型（ASR，离线）            │
│   └─ models/piper Piper 华彦中文模型（TTS，离线）           │
└─────────────────────────────────────────────────────────────┘
```

**一句话理解**：大屏前端负责"画面 + 交互编排"，语音服务负责"听（ASR）+ 说（TTS）"。两者在同一台机器上，前端通过 `fetch` 把录音发给语音服务、把文本交给语音服务合成语音。客户机**不连外网**，所以一切走本地模型。

## 二、功能清单

### ✅ 已完成功能（点击进入详细文档）

| # | 功能 | 核心文件 | 文档 |
|---|------|----------|------|
| 1 | 场景切换交叉淡化 + 运镜 | `page.tsx` / `globals.css` | [01-场景切换交叉淡化与运镜](features/01-场景切换交叉淡化与运镜.md) |
| 2 | 视频 ↔ 背景模式交叉淡化 | `page.tsx` / `globals.css` | [02-视频与背景模式交叉淡化](features/02-视频与背景模式交叉淡化.md) |
| 3 | 纯语音交互（删文字输入） | `page.tsx` / `globals.css` | [03-纯语音交互](features/03-纯语音交互.md) |
| 4 | 数字人形象体系（去背/对齐/放大/光圈） | `globals.css` / `public/avatar-*.png` / `scripts/tools/normalize_avatars.py` | [04-数字人形象体系](features/04-数字人形象体系.md) |
| 5 | 子分区导航 + 宣传廊跳模拟药店 | `page.tsx` / `globals.css` | [05-子分区导航](features/05-子分区导航.md) |
| 6 | 资产优化与切换性能 | `scripts/tools/optimize_assets.py` / `page.tsx` | [06-资产优化与切换性能](features/06-资产优化与切换性能.md) |
| 7 | 语音链路（Vosk+Piper+VAD+性别+预录） | `lib/voice.ts` / `voice-service/server.py` / `api/voice/*` | [07-语音链路](features/07-语音链路.md) |
| 8 | 唤醒与空闲超时 | `page.tsx` | [08-唤醒与空闲超时](features/08-唤醒与空闲超时.md) |
| 9 | 导航触发表（按场景） | `lib/tour-nav.ts` / `page.tsx` | [09-导航触发表](features/09-导航触发表.md) |

### 🚧 未完成 / 待办（后续迭代）

**语音识别（ASR）健壮性**
- VAD 阈值外置 `.env` 文件：代码已读 `NEXT_PUBLIC_VAD_FLOOR / _START_K / _END_K` 三个环境变量，但**部署包里还没建 `.env`**，现场按环境调阈值时仍需改代码或补 `.env`。（见 `lib/voice.ts:249-251`）
- `classify` 意图优先级重排：当前第 1 步主场景 → 第 2 步返回 → 第 3 步子分区 → 第 4 步闲聊 → 第 5 步模糊兜底。可再加"唤醒词/数字人名字"独立分支，避免名字和导航误判。（见 `lib/voice.ts:336`）
- 删单字"药"关键词：避免说"药"就误跳（目前 `ZONE_KEYWORDS` 已用"药品/药物"而非裸"药"，但兜底 `fuzzyMatch` 仍可能误中）。
- 主场景正则收窄：当前 `SCENE_JUMP` 已刻意**不含**裸"药房/药店"，但宣传廊子分区正则 `/(药品|药物)/` 在展厅嘈杂下仍可能把"模拟药店"吞成药品区——已用 `correctAsrText` 近音纠错缓解，未根治。

**称呼/音色一致性**
- 性别变体话术：浏览器原生 ASR（开发期默认）返回 `gender=neutral`，永远走"您"；只有生产外部 ASR 才返回 male/female。预录音频已有先生/女士/您三套（`tts-map.json`），但开发期听不到性别差异。
- 预录音频为女声（晓晓 XiaoxiaoNeural），兜底 Piper 为男声（华彦）——动态文本未预录时会掉男声，音色不一致。

**部署**
- `big-screen/frontend/deploy/` 部署包**缺 voice-service / Python / 模型**，发给客户前必须补上并改 start 脚本拉起语音服务。
- 客户机需预装 Vosk+Piper 模型（`big-screen/voice-service/models/`），并一次下载后永不联网。

**内容与素材**
- 各分区视频素材：客户只给了 welcome / corridor-overview / pharmacy 三段，其余分区视频用 `FALLBACK` 回退到父场景视频（见 `page.tsx:42-50`），未到位时画面重复但不黑屏。
- 小智平台「问学考」与知识库：纯配置/占位，由另一平台负责，前端未对接（前端 `handleUser` 已不再调 `/api/chat`，事实类问题统一给迎宾引导）。

## 三、给学习者的阅读顺序建议

1. 先读 `page.tsx` 顶部的常量与 `SCENE_META`/`NavState`（理解"大屏有哪几个场景、状态怎么表示"）。
2. 再读 `globals.css` 里 `.bg-layer / .avatar-stack / .mic-fab` 三块（理解"画面怎么排布的"）。
3. 然后读 `lib/voice.ts` 的 `createServerVoice`（理解"录音→ASR→意图→TTS→播放"整条链路）。
4. 最后对照本目录的功能文档；导航联调优先读 [09-导航触发表](features/09-导航触发表.md)，其余文档标了**文件:行号**，可以边读边在代码里跳转。

> 所有文档里的行号基于 2026-08-07 的代码状态，后续改动后行号可能偏移，但函数名/关键常量不变。
