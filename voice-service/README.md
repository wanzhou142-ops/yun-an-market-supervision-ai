# 本地语音服务（离线优先）

客户机不能连外网，所以语音引擎必须本地模型化。
本服务跑在客户电脑本机 `127.0.0.1:8000`，给前端提供：

- `POST /asr` 语音识别（麦克风录音 → 文字）
- `POST /tts` 语音合成（文字 → 音频）
- `GET  /health` 健康检查

## 快速开始（你在自己电脑上测试）

### 1. 下载模型（有网时跑一次）

Windows CMD 双击：

```
download_models.bat
```

或 Git Bash：

```bash
bash download_models.sh
```

这会：
- 创建 managed Python venv（如果不存在）
- 安装 `vosk / piper-tts / edge-tts`
- 下载 Vosk 普通话小模型（约 40 MB）
- 下载 Piper 普通话语音模型（约 60 MB）

如果下载 HuggingFace 模型慢，先开代理再运行：

```cmd
set HF_ENDPOINT=https://hf-mirror.com
download_models.bat
```

或 Git Bash：

```bash
export HF_ENDPOINT=https://hf-mirror.com
bash download_models.sh
```

### 2. 启动语音服务

```
start.bat
```

默认离线模式：
- TTS = Piper 本地模型
- ASR = Vosk 本地模型

看到 `http://127.0.0.1:8000 (tts=piper, asr=vosk)` 即成功。

### 3. 验证

```bash
curl http://127.0.0.1:8000/health
```

应返回 `piper_model: true` 和 `vosk_model: true`。

### 4. 起前端一起测

```bash
cd ../dify-frontend
bash dev.sh
```

浏览器打开 `http://localhost:3000`，点「开始互动」→ 麦克风，说：
- "安安"
- "宣传廊"
- "药店"
- "返回"

## 在线快速自测（不下载模型，仅验证链路）

如果你暂时不想下模型，只想确认"前端 → 服务 → 音频播放"整条链路通：

修改 `start.bat` 里两行：

```bat
set "TTS_BACKEND=edge-tts"
set "ASR_BACKEND=mock"
```

再双击 `start.bat`。此时：
- TTS 走 edge-tts（连微软，需你本机能出外网）
- ASR 走 mock，按轮询返回脚本短语，也能驱动场景切换

**注意：edge-tts/mock 仅自测用，不能交付客户机。**

## 交付客户机

把下面这些一起拷过去即可：

```
voice-service/
  server.py
  start.bat
  download_models.py      # 可选：客户机不联网，不需要运行
  models/                 # 重点：包含已下载好的 Vosk + Piper 模型
  requirements.txt
```

客户机不需要 Python 环境（如果你用便携 Python 打包），也不需要联网。

## 目录结构

```
voice-service/
  download_models.py      # 模型下载主脚本
  download_models.bat
  download_models.sh
  server.py               # 语音服务主程序
  start.bat
  start.sh
  requirements.txt
  models/
    vosk-model-small-cn-0.22/
    piper/
      zh_CN-huayan-medium.onnx
      zh_CN-huayan-medium.onnx.json
```

## 常见问题

**Q: start.bat 里出现乱码？**  
A: 已修复。脚本第一行 `chcp 65001` 强制 UTF-8，不会再把中文注释解析成乱码命令。

**Q: 提示找不到 venv python？**  
A: 先运行 `download_models.bat` 创建 venv 并安装依赖。

**Q: 模型下载慢或 HuggingFace 打不开？**  
A: 先设置镜像再运行：

```cmd
set HF_ENDPOINT=https://hf-mirror.com
download_models.bat
```

**Q: 客户机完全离线，如何打包？**  
A: 在你本机跑完 `download_models.bat`（需要外网），然后把整个 `voice-service/models/` 目录连同 `server.py`、`start.bat` 一起复制到客户机。`models/` 已包含全部本地模型，运行时不再联网。

**Q: `/asr-test` 返回空或 TTS 只输出 44 字节？**  
A: 这是 `piper-tts` 新版 API 变化导致的：`PiperVoice.synthesize(text)` 现在返回 `AudioChunk` 迭代器，而不是直接往 `wave` 文件里写。`server.py` 已适配新版 API；如果你自行升级了 `piper-tts`，请确认使用相同写法。

**Q: 麦克风录音有音量但 ASR 返回空？**  
A: 检查两点：
1. 浏览器默认会对麦克风做降噪/回声消除/自动增益，这些处理可能让小模型识别更差。前端已关闭这三项（`echoCancellation/noiseSuppression/autoGainControl = false`）。
2. `ScriptProcessorNode` 不要连 `audioCtx.destination`，否则会把麦克风回环播到扬声器，产生回声污染录音。前端已去掉该连接。

**Q: Vosk 识别不准确（如“宣传廊”→“宣传狼”）？**  
A: `vosk-model-small-cn-0.22` 是轻量模型，识别率有限。前端已加编辑距离兜底，把常见错字拉回正确关键词。如果现场环境噪声大，可考虑换成更大的 Vosk 模型（如 `vosk-model-cn-0.22`，约 1.3GB），在 `start.bat` 里改 `VOSK_MODEL` 路径即可。
