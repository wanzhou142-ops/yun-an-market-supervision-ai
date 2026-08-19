# 数字人三态视频资产制作指南

> 目标：为待机 / 聆听 / 说话三态各准备一段**可无缝循环的透明 WebM**，前端按语音状态切换播放。  
> 静态 PNG 无法通过代码「变出」挥手动作，必须用 AI 图生视频或设计师出片。

## 一、文件目录

```
big-screen/frontend/public/avatar-states/
  idle.png          # 占位海报（已有，来自 setup:avatars）
  listening.png
  speaking.png
  idle.webm         # 正式动画（AI 生成 + 转码后）
  listening.webm
  speaking.webm
  raw/              # 原始导出，供 ffmpeg 转码
    idle.mp4
    listening.mp4
    speaking.mp4
```

运行 `npm run prepare:avatars` 会扫描 `.webm` 是否存在，自动更新 [`lib/avatar-states-manifest.json`](../frontend/lib/avatar-states-manifest.json)（有 webm 则 `type: "video"`，否则 fallback PNG）。

---

## 二、Step 1：AI 图生视频（可灵 / Runway / 即梦）

| 状态 | 参考图 | 提示词参考 |
|------|--------|------------|
| **idle** | `public/avatar-pharmacy.png` | 卡通政务数字人，正面站立持文件夹，轻微呼吸，偶尔眨眼，头发与衣角微动，双手基本不动，镜头固定，背景不变，适合循环 |
| **listening** | `public/avatar-corridor.png` | 卡通政务数字人，侧身聆听，轻微点头，目光专注，动作幅度小，镜头固定，适合循环 |
| **speaking** | `public/avatar-welcome.png` | 卡通政务数字人，保持外观一致，持续向观众挥手讲解，口型自然张合，上半身稳定，镜头固定，适合 3–5 秒循环 |

建议：

- 时长 **5 秒**，每个状态生成 2–3 版选最自然的一条
- 首尾帧尽量接近，便于后期裁循环
- 若平台不支持透明底，生成时使用**纯绿幕背景 `#00FF00`**，便于 ffmpeg 抠像

---

## 三、Step 2：抠透明底

任选其一：

1. **绿幕 + ffmpeg**（见下方转码命令，适合批量）
2. 在线工具：Unscreen、Runway Remove Background
3. 可灵数字人功能（若输出带 alpha 或易抠背景）

目标格式：**WebM VP9 + Alpha（yuva420p）**，Chrome 大屏可直接透明叠加。

---

## 四、Step 3：ffmpeg 转码与循环

将原始 MP4 放入 `public/avatar-states/raw/`，然后：

```bash
cd big-screen/frontend
npm run prepare:avatars
```

### 手动命令参考（绿幕输入）

```bash
# 裁剪 0–5 秒，绿幕抠像，输出透明 WebM
ffmpeg -i public/avatar-states/raw/speaking.mp4 -t 5 \
  -vf "chromakey=0x00FF00:0.12:0.08,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 2M \
  public/avatar-states/speaking.webm
```

### 已有透明底 MOV/WebM

```bash
ffmpeg -i public/avatar-states/raw/idle.mov -t 5 -c:v libvpx-vp9 -pix_fmt yuva420p \
  public/avatar-states/idle.webm
```

### 检查 alpha

```bash
ffprobe -show_streams public/avatar-states/speaking.webm
# 应看到 pix_fmt=yuva420p
```

---

## 五、前端行为

- 有 `.webm`：`<video autoplay loop muted playsinline>` 播放真实动作
- 无 `.webm`：fallback 静态 PNG（开发占位）
- 状态切换：300ms 交叉淡化，避免硬切

替换资产后只需覆盖 `public/avatar-states/*.webm` 并执行 `npm run prepare:avatars` 刷新 manifest（或重启 dev）。

---

## 六、验收

1. 静默 → idle 视频内人物自身微动（非整图 CSS 缩放）
2. 麦克风聆听 → listening 视频
3. TTS 播报 → speaking 视频（挥手循环）
4. 任意时刻只显示一个数字人
5. 离线可用，不依赖运行时 AI API
