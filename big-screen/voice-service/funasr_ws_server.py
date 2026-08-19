"""FunASR WebSocket 流式 ASR（online 模式 · 客户端 VAD）。

协议兼容 FunASR runtime websocket_protocol_zh.md：
  1. 首条 JSON 配置（mode=online, chunk_size, hotwords, audio_fs）
  2. 持续发送 16k PCM16 二进制帧
  3. 客户端 VAD 句末发送 {"is_speaking": false}
  4. 服务端返回 {"mode":"online","text":"...","is_final":false|true}

与 DashScope ws_asr_bridge 分离；batch REST 仍走 dashscope_asr.py。
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

DEFAULT_HOTWORDS: dict[str, int] = {
    "宣传廊": 10,
    "普法宣传廊": 10,
    "宣传栏": 10,
    "宣传郎": 10,
    "模拟药店": 8,
    "药品区": 8,
    "器械区": 8,
    "化妆品区": 8,
    "科普": 6,
    "法规": 6,
    "案例": 6,
    "返回": 6,
    "迎宾": 6,
}

_model = None
_model_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 2)))


def _hotwords_json() -> str:
    raw = (os.environ.get("FUNASR_HOTWORDS") or "").strip()
    if raw:
        out: dict[str, int] = {}
        for part in raw.replace("，", ",").split(","):
            w = part.strip()
            if w:
                out[w] = 5
        if out:
            return json.dumps(out, ensure_ascii=False)
    return json.dumps(DEFAULT_HOTWORDS, ensure_ascii=False)


def _load_model():
    global _model
    with _model_lock:
        if _model is not None:
            return _model
        try:
            from funasr import AutoModel
        except ImportError as e:
            raise RuntimeError(
                "未安装 funasr。请执行：pip install -r requirements-funasr.txt"
            ) from e

        device = (os.environ.get("FUNASR_DEVICE") or "cpu").strip()
        model_id = (
            os.environ.get("FUNASR_STREAM_MODEL")
            or "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online"
        ).strip()
        print(f"[funasr_ws] 加载流式模型 {model_id} device={device} …")
        _model = AutoModel(
            model=model_id,
            device=device,
            disable_pbar=True,
            disable_log=True,
        )
        print("[funasr_ws] 模型就绪")
        return _model


def _generate_online(audio: bytes, status: dict[str, Any]) -> list[dict]:
    model = _load_model()
    return model.generate(input=audio, **status)


def _extract_text(result_list: list) -> str:
    if not result_list:
        return ""
    item = result_list[0]
    if isinstance(item, dict):
        return str(item.get("text") or "").strip()
    return str(item).strip()


async def _run_blocking(fn, *args, **kwargs):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _executor, lambda: fn(*args, **kwargs)
    )


async def _handle_connection(websocket) -> None:
    path = getattr(getattr(websocket, "request", None), "path", "") or ""
    if path and path not in ("/", "/ws", "/asr/stream"):
        await websocket.close(1008, "invalid path")
        return

    wav_name = "mic"
    chunk_interval = 10
    audio_fs = 16000
    frames_online: list[bytes] = []
    status_online: dict[str, Any] = {
        "cache": {},
        "is_final": False,
        "chunk_size": [5, 10, 5],
    }
    configured = False
    is_speaking = True

    async def _infer_online(is_final: bool) -> None:
        nonlocal frames_online
        status_online["is_final"] = is_final
        audio_in = b"".join(frames_online)
        if not audio_in and not is_final:
            return
        try:
            out = await _run_blocking(_generate_online, audio_in, status_online)
            text = _extract_text(out)
            if text or is_final:
                msg = {
                    "mode": "online",
                    "wav_name": wav_name,
                    "text": text,
                    "is_final": is_final,
                }
                await websocket.send(json.dumps(msg, ensure_ascii=False))
                if text:
                    print(f"[funasr_ws] {'final' if is_final else 'partial'}: {text!r}")
        except Exception as e:
            err = {"mode": "online", "text": "", "is_final": True, "error": str(e)}
            await websocket.send(json.dumps(err, ensure_ascii=False))
            print(f"[funasr_ws] infer error: {e}")
        frames_online = []

    try:
        async for message in websocket:
            if isinstance(message, str):
                try:
                    obj = json.loads(message)
                except json.JSONDecodeError:
                    continue

                if "wav_name" in obj:
                    wav_name = str(obj.get("wav_name") or wav_name)
                if "chunk_interval" in obj:
                    chunk_interval = max(1, int(obj["chunk_interval"]))
                if "audio_fs" in obj:
                    audio_fs = int(obj["audio_fs"])
                if "chunk_size" in obj:
                    cs = obj["chunk_size"]
                    if isinstance(cs, str):
                        cs = [int(x.strip()) for x in cs.split(",") if x.strip()]
                    status_online["chunk_size"] = [int(x) for x in cs]
                    configured = True
                if "hotwords" in obj:
                    status_online["hotword"] = obj["hotwords"]
                elif not configured and "mode" in obj:
                    status_online.setdefault("hotword", _hotwords_json())

                if "mode" in obj and obj["mode"]:
                    if obj["mode"] != "online":
                        await websocket.send(
                            json.dumps(
                                {
                                    "mode": "online",
                                    "text": "",
                                    "is_final": True,
                                    "error": f"unsupported mode {obj['mode']!r}, use online",
                                },
                                ensure_ascii=False,
                            )
                        )
                    configured = True

                if "is_speaking" in obj:
                    is_speaking = bool(obj["is_speaking"])
                    if not is_speaking:
                        await _infer_online(is_final=True)
                        status_online["cache"] = {}
                        status_online["is_final"] = False
                    else:
                        frames_online = []
                        status_online["cache"] = {}
                        status_online["is_final"] = False
                elif obj.get("mode") == "online":
                    configured = True
                continue

            if not configured:
                status_online["chunk_size"] = [5, 10, 5]
                status_online["hotword"] = _hotwords_json()
                configured = True

            pcm = bytes(message)
            frames_online.append(pcm)
            if len(frames_online) % chunk_interval == 0:
                await _infer_online(is_final=False)

    except Exception as e:
        print(f"[funasr_ws] connection error: {e}")


def _run_ws_server(host: str, port: int) -> None:
    import websockets

    async def _main() -> None:
        async with websockets.serve(_handle_connection, host, port):
            await asyncio.Future()

    asyncio.run(_main())


def start_funasr_ws_thread(port: Optional[int] = None) -> threading.Thread:
    port = port or int(os.environ.get("VOICE_WS_PORT", "10095"))
    host = os.environ.get("VOICE_SERVICE_HOST", "0.0.0.0")

    def _runner() -> None:
        try:
            _run_ws_server(host, port)
        except Exception as e:
            print(f"[funasr_ws] 服务异常退出：{e}")

    t = threading.Thread(target=_runner, daemon=True, name="funasr-ws")
    t.start()
    print(
        f"[voice-service] FunASR WS ws://127.0.0.1:{port} "
        f"(bind={host}, mode=online, client-vad)"
    )
    return t
