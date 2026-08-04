# 本地语音服务（我们自建，跑在客户电脑本机 127.0.0.1:8000）
# ===========================================================================
# 关键约束：客户机【不能连外网】。所以语音引擎必须是【本地模型】，不能依赖任何云。
#
#   TTS（合成）后端（TTS_BACKEND）：
#     piper    -> Piper 本地模型（离线·首选·中文质量好，需下载一次模型）  ★交付用
#     sapi     -> Windows 系统 SAPI5 嗓音（离线·零下载，但依赖系统装了中文嗓音）
#     edge-tts -> 微软云端（在线·仅本机调试用，客户机不可用，勿交付）
#
#   ASR（识别）后端（ASR_BACKEND）：
#     vosk     -> Vosk 本地模型（离线·首选·普通话小模型，需下载一次）      ★交付用
#     mock     -> 返回脚本短语（无麦克风/无模型时演示整条链路用）
#     cloud    -> 云端 ASR（在线·仅本机调试，勿交付）
#
# 浏览器把麦克风录成 16k 单声道 WAV 发到 /asr；/tts 返回音频（mp3 或 wav）。
# 前端 play 的是 /api/voice/tts 转发回来的音频，与后端格式无关。
# ===========================================================================
import os
import io
import json
import wave
import asyncio
import tempfile
import http.server
import socketserver

# ---- 配置（环境变量可改）----
PORT = int(os.environ.get("VOICE_SERVICE_PORT", "8000"))
TTS_BACKEND = (os.environ.get("TTS_BACKEND") or "piper").lower()
ASR_BACKEND = (os.environ.get("ASR_BACKEND") or "vosk").lower()
PIPER_MODEL = os.environ.get("PIPER_MODEL") or os.path.join(
    os.path.dirname(__file__), "models", "piper", "zh_CN-huayan-medium.onnx"
)
PIPER_CONFIG = os.environ.get("PIPER_CONFIG") or (PIPER_MODEL + ".json")
VOSK_MODEL = os.environ.get("VOSK_MODEL") or os.path.join(
    os.path.dirname(__file__), "models", "vosk-model-small-cn-0.22"
)
EDGE_VOICE_FEMALE = "zh-CN-XiaoxiaoNeural"
EDGE_VOICE_MALE = "zh-CN-YunxiNeural"

# mock 模式按轮询返回脚本化短语，方便无麦克风/无模型时演示"切场景"整条链路
MOCK_PHRASES = [
    "你好安安",
    "我想去普法宣传廊",
    "那模拟药店呢",
    "返回迎宾大厅",
]
_mock_idx = 0

# --------------------------------------------------------------------------
# 全局单例：启动时预加载，避免每次请求重复加载模型（这是延迟主因）
# --------------------------------------------------------------------------
_vosk_model = None
_piper_voice = None
_piper_config = None


def _load_models():
    """启动时预加载 ASR/TTS 模型。失败也打印警告，让服务仍能启动以暴露问题。"""
    global _vosk_model, _piper_voice, _piper_config
    if ASR_BACKEND == "vosk":
        try:
            vosk = _lazy("vosk", "Model")
            import vosk as _vosk_mod  # noqa

            if os.path.exists(VOSK_MODEL):
                _vosk_model = _vosk_mod.Model(VOSK_MODEL)
                print(f"[voice-service] Vosk 模型已预加载：{VOSK_MODEL}")
            else:
                print(f"[voice-service] 警告：Vosk 模型不存在：{VOSK_MODEL}")
        except Exception as e:
            print(f"[voice-service] 警告：预加载 Vosk 模型失败：{e}")
    if TTS_BACKEND == "piper":
        try:
            piper = _lazy("piper", "PiperVoice")
            import piper as _piper_mod  # noqa

            if os.path.exists(PIPER_MODEL):
                _piper_voice = _piper_mod.PiperVoice.load(
                    PIPER_MODEL, PIPER_CONFIG, use_cuda=False
                )
                _piper_config = _piper_voice.config
                print(f"[voice-service] Piper 模型已预加载：{PIPER_MODEL}")
            else:
                print(f"[voice-service] 警告：Piper 模型不存在：{PIPER_MODEL}")
        except Exception as e:
            print(f"[voice-service] 警告：预加载 Piper 模型失败：{e}")


def _lazy(mod, name):
    """延迟 import，缺失时给出可读错误，而不是一启动就崩。"""
    try:
        return __import__(mod, fromlist=[name])
    except Exception as e:
        raise RuntimeError(f"缺少依赖 {mod}：{e}（请先 pip install 并在本机准备模型）")


# --------------------------------------------------------------------------
# TTS 实现
# --------------------------------------------------------------------------
async def tts_piper(text: str) -> tuple[bytes, str]:
    global _piper_voice, _piper_config
    piper = _lazy("piper", "PiperVoice")
    if not os.path.exists(PIPER_MODEL):
        raise RuntimeError(
            f"Piper 模型不存在：{PIPER_MODEL}\n"
            f"请在本机（有网）运行 download_models 脚本下载，再连同模型打包给客户机。"
        )
    import piper  # noqa
    import numpy as np  # noqa

    # 优先使用启动时预加载的 voice 单例，避免每次请求重新 load（约省 1~3 秒）
    if _piper_voice is None:
        _piper_voice = piper.PiperVoice.load(PIPER_MODEL, PIPER_CONFIG, use_cuda=False)
        _piper_config = _piper_voice.config
    voice = _piper_voice
    sample_rate = _piper_config.sample_rate if _piper_config else voice.config.sample_rate

    # 新版 piper-tts API：synthesize 返回 AudioChunk 可迭代对象，
    # 旧版的 voice.synthesize(text, wav_file) 已失效，会输出空 WAV。
    chunks = list(voice.synthesize(text))
    if not chunks:
        raise RuntimeError("Piper 未生成任何音频")

    all_audio = np.concatenate([c.audio_float_array for c in chunks])
    int16 = np.int16(np.clip(all_audio, -1.0, 1.0) * 32767)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int16.tobytes())
    return buf.getvalue(), "audio/wav"


def tts_sapi(text: str) -> tuple[bytes, str]:
    pyttsx3 = _lazy("pyttsx3", "init")
    import pyttsx3  # noqa
    # 优先挑一个中文嗓音
    engine = pyttsx3.init()
    for v in engine.getProperty("voices"):
        if "zh" in (v.id or "").lower() or "chinese" in (v.name or "").lower():
            engine.setProperty("voice", v.id)
            break
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.close()
    engine.save_to_file(text, tmp.name)
    engine.runAndWait()
    with open(tmp.name, "rb") as f:
        data = f.read()
    os.remove(tmp.name)
    return data, "audio/wav"


async def tts_edge(text: str, voice: str) -> tuple[bytes, str]:
    edge_tts = _lazy("edge_tts", "Communicate")
    import edge_tts  # noqa
    buf = io.BytesIO()
    comm = edge_tts.Communicate(text=text, voice=voice)
    async for chunk in comm.stream():
        if chunk.get("type") == "audio":
            buf.write(chunk["data"])
    return buf.getvalue(), "audio/mpeg"


# --------------------------------------------------------------------------
# 调试目录：保存最近一次 ASR 的原始音频与结果，方便排麦克风/识别问题
# --------------------------------------------------------------------------
DEBUG_DIR = os.environ.get("DEBUG_DIR") or os.path.join(
    os.path.dirname(__file__), "debug"
)
os.makedirs(DEBUG_DIR, exist_ok=True)


def _save_debug(wav_bytes: bytes, result: dict):
    """保存最近一次 ASR 音频和识别结果，覆盖写入。"""
    try:
        with open(os.path.join(DEBUG_DIR, "asr_last.wav"), "wb") as f:
            f.write(wav_bytes)
        with open(os.path.join(DEBUG_DIR, "asr_last.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _pcm_rms_dbfs(pcm: bytes) -> float:
    """计算 16bit PCM 的 RMS 音量（dBFS）。静音约 -90dB，正常语音约 -30~-10dB。"""
    try:
        import array
        import math

        samples = array.array("h", pcm)
        if not samples:
            return -999.0
        sum_sq = sum(s * s for s in samples)
        rms = (sum_sq / len(samples)) ** 0.5
        if rms <= 0:
            return -999.0
        return round(20 * math.log10(rms / 32768.0), 2)
    except Exception:
        return -999.0


# --------------------------------------------------------------------------
# ASR 实现
# --------------------------------------------------------------------------
def _resample_pcm(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
    """纯 Python 线性插值重采样：把 16bit 单声道 PCM 从 src_rate 重采样到 dst_rate。
    不用 audioop（Python 3.13 已移除），也不依赖 numpy/scipy，方便离线部署。"""
    if src_rate == dst_rate:
        return pcm
    import array

    samples = array.array("h", pcm)
    ratio = dst_rate / src_rate
    new_len = int(len(samples) * ratio)
    out = array.array("h")
    for i in range(new_len):
        src_idx = i / ratio
        idx0 = int(src_idx)
        idx1 = min(idx0 + 1, len(samples) - 1)
        frac = src_idx - idx0
        val = samples[idx0] * (1 - frac) + samples[idx1] * frac
        out.append(int(round(val)))
    return out.tobytes()


def _read_wav_pcm(wav_bytes: bytes, require_rate: int = 16000):
    """解析 WAV，返回 (pcm, rate)。若 rate 不符则重采样为 require_rate。"""
    try:
        with io.BytesIO(wav_bytes) as wf_io:
            with wave.open(wf_io, "rb") as wf:
                nchannels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                framerate = wf.getframerate()
                if nchannels != 1 or sampwidth != 2:
                    raise RuntimeError(
                        f"WAV 格式不符：需要 单声道/16bit，"
                        f"实际 {framerate}Hz/{nchannels}ch/{sampwidth * 8}bit"
                    )
                pcm = wf.readframes(wf.getnframes())
                if framerate != require_rate:
                    pcm = _resample_pcm(pcm, framerate, require_rate)
                return pcm
    except Exception as e:
        raise RuntimeError(f"解析 WAV 失败：{e}")


def asr_vosk(wav_bytes: bytes) -> dict:
    global _vosk_model
    vosk = _lazy("vosk", "Model")
    import vosk  # noqa
    if not os.path.exists(VOSK_MODEL):
        raise RuntimeError(
            f"Vosk 模型不存在：{VOSK_MODEL}\n"
            f"请在本机（有网）运行 download_models 脚本下载，再连同模型打包给客户机。"
        )
    # 优先使用启动时预加载的 model 单例，避免每次请求重新加载（约省 1~3 秒）
    if _vosk_model is None:
        _vosk_model = vosk.Model(VOSK_MODEL)
    model = _vosk_model
    # 不用词表约束：small 模型在 grammar 模式下容易对轻声/短句返回空，
    # 改为全词汇识别 + 前端模糊兜底，误识别问题由前端规则兜住。
    rec = vosk.KaldiRecognizer(model, 16000)

    pcm = _read_wav_pcm(wav_bytes, require_rate=16000)
    # Vosk 官方推荐分块喂入（每块约 0.2~0.5 秒），比一次性喂整段更稳定。
    chunk_size = 8000  # 16kHz 16bit 单声道 = 0.5 秒
    for i in range(0, len(pcm), chunk_size):
        rec.AcceptWaveform(pcm[i : i + chunk_size])
    res = json.loads(rec.FinalResult())
    return {
        "text": res.get("text", "").strip(),
        "gender": "neutral",
        "bytes": len(wav_bytes),
        "rms_dbfs": round(_pcm_rms_dbfs(pcm), 2),
    }


def asr_mock() -> dict:
    global _mock_idx
    phrase = MOCK_PHRASES[_mock_idx % len(MOCK_PHRASES)]
    _mock_idx += 1
    return {"text": phrase, "gender": "neutral", "mock": True}


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(
            code,
            json.dumps(obj, ensure_ascii=False).encode("utf-8"),
            "application/json; charset=utf-8",
        )

    def do_GET(self):
        if self.path.startswith("/health"):
            # 统计 Vosk 模型目录里的文件数，帮助判断模型是否下载完整
            vosk_files = 0
            if os.path.isdir(VOSK_MODEL):
                for _root, _dirs, files in os.walk(VOSK_MODEL):
                    vosk_files += len(files)
            self._json(
                200,
                {
                    "ok": True,
                    "tts_backend": TTS_BACKEND,
                    "asr_backend": ASR_BACKEND,
                    "piper_model": os.path.exists(PIPER_MODEL),
                    "vosk_model": os.path.exists(VOSK_MODEL),
                    "vosk_model_files": vosk_files,
                },
            )
        elif self.path.startswith("/asr-test"):
            self.handle_asr_test()
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b""
        if self.path.startswith("/tts"):
            self.handle_tts(raw)
        elif self.path.startswith("/asr"):
            self.handle_asr(raw)
        else:
            self._json(404, {"error": "not found"})

    def handle_tts(self, raw):
        try:
            data = json.loads(raw or b"{}")
        except Exception:
            data = {}
        text = (data.get("text") or "").strip()
        voice = data.get("voice") or EDGE_VOICE_FEMALE
        if not text:
            self._json(400, {"error": "text required"})
            return
        try:
            if TTS_BACKEND == "piper":
                audio, ctype = asyncio.run(tts_piper(text))
            elif TTS_BACKEND == "sapi":
                audio, ctype = tts_sapi(text)
            elif TTS_BACKEND == "edge-tts":
                audio, ctype = asyncio.run(tts_edge(text, voice))
            else:
                self._json(400, {"error": f"未知 TTS_BACKEND={TTS_BACKEND}"})
                return
        except RuntimeError as e:
            self._json(400, {"error": str(e)})
            return
        except Exception as e:
            self._json(500, {"error": f"tts failed: {e}"})
            return
        self._send(200, audio, ctype)

    def handle_asr(self, raw):
        try:
            if ASR_BACKEND == "vosk":
                result = asr_vosk(raw)
            elif ASR_BACKEND == "mock":
                result = asr_mock()
            elif ASR_BACKEND == "cloud":
                self._json(501, {"error": "cloud ASR 未实现（客户机离线不应使用）"})
                return
            else:
                self._json(400, {"error": f"未知 ASR_BACKEND={ASR_BACKEND}"})
                return
        except RuntimeError as e:
            self._json(400, {"error": str(e)})
            return
        except Exception as e:
            self._json(500, {"error": f"asr failed: {e}"})
            return
        _save_debug(raw, result)
        self._json(200, result)

    def handle_asr_test(self):
        """自测 ASR：用本地 TTS 生成一句已知中文，再喂给 Vosk 识别，验证模型/链路正常。"""
        if ASR_BACKEND != "vosk":
            self._json(400, {"error": "asr-test 仅在 ASR_BACKEND=vosk 时可用"})
            return
        test_text = "你好安安"
        try:
            # 优先用 Piper（输出 wav，直接喂 ASR）；次选 SAPI5
            if os.path.exists(PIPER_MODEL):
                audio, _ = asyncio.run(tts_piper(test_text))
                used = "piper"
            else:
                audio, _ = tts_sapi(test_text)
                used = "sapi"
        except Exception as e:
            self._json(500, {"error": f"生成测试音频失败：{e}"})
            return
        try:
            result = asr_vosk(audio)
        except Exception as e:
            self._json(500, {"error": f"ASR 自测识别失败：{e}"})
            return
        result["test_text"] = test_text
        result["test_tts"] = used
        _save_debug(audio, result)
        self._json(200, result)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    HOST = os.environ.get("VOICE_SERVICE_HOST", "0.0.0.0")
    _load_models()
    with socketserver.ThreadingTCPServer((HOST, PORT), Handler) as httpd:
        httpd.daemon_threads = True  # 主进程退出时自动结束工作线程，避免挂起
        print(
            f"[voice-service] http://localhost:{PORT} (bind={HOST}, "
            f"tts={TTS_BACKEND}, asr={ASR_BACKEND}, threaded=True)"
        )
        httpd.serve_forever()
