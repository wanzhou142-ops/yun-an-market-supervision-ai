"""sherpa-onnx 关键词 spotting WebSocket（导航专用 · 客户端 VAD）。

协议：
  客户端 → JSON {"type":"start"}  开始一轮
  客户端 → binary int16 PCM 16kHz
  服务端 → JSON {"type":"keyword","text":"宣传廊"}
  客户端 → JSON {"type":"stop"}   结束（不断开 WS）
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
from pathlib import Path
from typing import Optional

import numpy as np

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = (
    ROOT
    / "models"
    / "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01"
)
KEYWORDS = ROOT / "nav_keywords.txt"

_spotter = None
_spotter_lock = threading.Lock()


def _model_paths() -> tuple[Path, Path, Path, Path, Path]:
    model_dir = Path(
        os.environ.get("KWS_MODEL_DIR") or str(DEFAULT_MODEL)
    ).resolve()
    use_int8 = os.environ.get("KWS_USE_INT8", "true").lower() not in (
        "0",
        "false",
        "no",
    )
    enc = (
        model_dir / "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
        if use_int8
        else model_dir / "encoder-epoch-12-avg-2-chunk-16-left-64.onnx"
    )
    dec = model_dir / "decoder-epoch-12-avg-2-chunk-16-left-64.onnx"
    join = (
        model_dir / "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
        if use_int8
        else model_dir / "joiner-epoch-12-avg-2-chunk-16-left-64.onnx"
    )
    tok = model_dir / "tokens.txt"
    kw = Path(os.environ.get("KWS_KEYWORDS_FILE") or str(KEYWORDS)).resolve()
    return enc, dec, join, tok, kw


def _load_spotter():
    global _spotter
    with _spotter_lock:
        if _spotter is not None:
            return _spotter
        try:
            import sherpa_onnx
        except ImportError as e:
            raise RuntimeError(
                "未安装 sherpa-onnx。请执行: pip install -r requirements-kws.txt"
            ) from e

        enc, dec, join, tok, kw = _model_paths()
        for p in (enc, dec, join, tok, kw):
            if not p.is_file():
                raise RuntimeError(
                    f"KWS 文件缺失: {p}\n"
                    "请运行: python kws/download_kws_models.py && python kws/gen_nav_keywords.py"
                )

        threshold = float(os.environ.get("KWS_THRESHOLD", "0.15"))
        score = float(os.environ.get("KWS_KEYWORDS_SCORE", "2.0"))
        threads = int(os.environ.get("KWS_NUM_THREADS", "2"))

        print(f"[kws_ws] 加载模型 enc={enc.name} keywords={kw.name}")
        _spotter = sherpa_onnx.KeywordSpotter(
            tokens=str(tok),
            encoder=str(enc),
            decoder=str(dec),
            joiner=str(join),
            keywords_file=str(kw),
            num_threads=threads,
            keywords_score=score,
            keywords_threshold=threshold,
            num_trailing_blanks=int(os.environ.get("KWS_TRAILING_BLANKS", "1")),
            provider=os.environ.get("KWS_PROVIDER", "cpu"),
        )
        print("[kws_ws] KeywordSpotter 就绪")
        return _spotter


class _KwsStream:
    def __init__(self, spotter):
        self.spotter = spotter
        self.stream = spotter.create_stream()

    def reset(self) -> None:
        self.stream = self.spotter.create_stream()

    def feed_int16(self, pcm: bytes) -> Optional[str]:
        if not pcm:
            return None
        if len(pcm) % 2 == 1:
            pcm = pcm[:-1]
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        self.stream.accept_waveform(16000, samples)
        hit: Optional[str] = None
        while self.spotter.is_ready(self.stream):
            self.spotter.decode_stream(self.stream)
            result = self.spotter.get_result(self.stream)
            if result:
                hit = _normalize_keyword(str(result))
                print(f"[kws_ws] hit: {hit!r}")
                self.spotter.reset_stream(self.stream)
                break
        return hit


def _normalize_keyword(raw: str) -> str:
    s = raw.strip()
    if "@" in s:
        s = s.split("@")[-1].strip()
    return s


async def _handle_connection(websocket) -> None:
    path = getattr(getattr(websocket, "request", None), "path", "") or ""
    if path and path not in ("/", "/kws", "/asr/stream"):
        await websocket.close(1008, "invalid path")
        return

    try:
        spotter = _load_spotter()
    except Exception as e:
        await websocket.send(
            json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)
        )
        await websocket.close(1011, "kws init failed")
        return

    session = _KwsStream(spotter)
    active = False

    try:
        async for message in websocket:
            if isinstance(message, str):
                try:
                    obj = json.loads(message)
                except json.JSONDecodeError:
                    continue
                typ = obj.get("type")
                if typ == "start":
                    session.reset()
                    active = True
                    await websocket.send(json.dumps({"type": "ready"}, ensure_ascii=False))
                elif typ == "stop":
                    active = False
                continue

            if not active:
                continue
            hit = session.feed_int16(bytes(message))
            if hit:
                await websocket.send(
                    json.dumps(
                        {"type": "keyword", "text": hit},
                        ensure_ascii=False,
                    )
                )
    except Exception as e:
        print(f"[kws_ws] connection error: {e}")


def _run_ws_server(host: str, port: int) -> None:
    import websockets

    async def _main() -> None:
        async with websockets.serve(_handle_connection, host, port):
            await asyncio.Future()

    asyncio.run(_main())


def start_kws_ws_thread(port: Optional[int] = None) -> threading.Thread:
    port = port or int(os.environ.get("KWS_WS_PORT", "10096"))
    host = os.environ.get("VOICE_SERVICE_HOST", "0.0.0.0")

    def _runner() -> None:
        try:
            _run_ws_server(host, port)
        except Exception as e:
            print(f"[kws_ws] 服务异常退出：{e}")

    t = threading.Thread(target=_runner, daemon=True, name="kws-ws")
    t.start()
    print(
        f"[voice-service] KWS WS ws://127.0.0.1:{port}/kws "
        f"(bind={host}, sherpa-onnx)"
    )
    return t
