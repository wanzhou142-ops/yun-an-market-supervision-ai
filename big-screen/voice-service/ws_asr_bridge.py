"""Browser WebSocket ↔ DashScope Fun-ASR 流式桥接（方案 A · Step 5）。"""
from __future__ import annotations

import asyncio
import json
import os
import threading
from typing import Callable, Optional

from dashscope_asr import _extract_text

DEFAULT_HOTWORDS = {
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


def _hotwords_from_env() -> dict[str, int]:
    raw = (os.environ.get("DASHSCOPE_ASR_HOTWORDS") or "").strip()
    if not raw:
        return dict(DEFAULT_HOTWORDS)
    out: dict[str, int] = {}
    for part in raw.replace("，", ",").split(","):
        word = part.strip()
        if word:
            out[word] = 5
    return out or dict(DEFAULT_HOTWORDS)


class DashScopeStreamSession:
    """单轮识别：PCM 帧 → DashScope Recognition 回调 → JSON 事件。"""

    def __init__(
        self,
        on_partial: Callable[[str], None],
        on_final: Callable[[str], None],
        on_error: Callable[[str], None],
    ):
        self.on_partial = on_partial
        self.on_final = on_final
        self.on_error = on_error
        self.recognition = None
        self._started = False
        self._last_text = ""
        self._got_final = False

    def start(self) -> None:
        api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
        if not api_key or api_key.startswith("sk-xxx"):
            raise RuntimeError(
                "DASHSCOPE_API_KEY 未配置。请在 voice-service/.env 填入百炼 API Key。"
            )

        try:
            import dashscope
            from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult
        except ImportError as e:
            raise RuntimeError(f"缺少 dashscope SDK：{e}") from e

        dashscope.api_key = api_key
        model = (os.environ.get("DASHSCOPE_ASR_MODEL") or "fun-asr-realtime").strip()
        language = (os.environ.get("DASHSCOPE_ASR_LANGUAGE") or "zh").strip()
        hotwords = _hotwords_from_env()
        session = self

        class _Cb(RecognitionCallback):
            def on_open(self) -> None:
                pass

            def on_close(self) -> None:
                pass

            def on_complete(self) -> None:
                if session._last_text and not session._got_final:
                    session._got_final = True
                    session.on_final(session._last_text)

            def on_error(self, message) -> None:
                msg = getattr(message, "message", None) or str(message)
                session.on_error(str(msg))

            def on_event(self, result) -> None:
                sentence = result.get_sentence()
                text = _extract_text(sentence)
                if not text:
                    return
                session._last_text = text
                try:
                    is_end = RecognitionResult.is_sentence_end(sentence)
                except Exception:
                    is_end = False
                session.on_partial(text)
                if is_end and not session._got_final:
                    session._got_final = True
                    session.on_final(text)

        kwargs: dict = {
            "model": model,
            "format": "pcm",
            "sample_rate": 16000,
            "language_hints": [language],
            "callback": _Cb(),
        }
        # 热词：流式部分 SDK 版本不支持 vocabulary，失败则不用
        try:
            self.recognition = Recognition(vocabulary=hotwords, **kwargs)
        except TypeError:
            self.recognition = Recognition(**kwargs)

        self.recognition.start()
        self._started = True
        self._fed_bytes = 0

    def feed(self, data: bytes) -> None:
        if self._started and self.recognition and data:
            try:
                self.recognition.send_audio_frame(data)
                self._fed_bytes += len(data)
            except Exception as e:
                self.on_error(f"feed failed: {e}")

    def stop(self) -> None:
        if self._started and self.recognition:
            try:
                self.recognition.stop()
            except Exception:
                pass
        self._started = False


async def _run_one_session(
    websocket,
    out_q: asyncio.Queue,
) -> bool:
    """启动一轮 ASR；返回 False 表示连接应关闭。"""

    def _schedule(obj: dict) -> None:
        loop = asyncio.get_running_loop()
        loop.call_soon_threadsafe(out_q.put_nowait, obj)

    def on_partial(t: str) -> None:
        print(f"[ws_asr_bridge] partial: {t!r}")
        _schedule({"type": "partial", "text": t})

    def on_error_msg(m: str) -> None:
        print(f"[ws_asr_bridge] error: {m}")
        _schedule({"type": "error", "message": m})

    session = DashScopeStreamSession(
        on_partial=on_partial,
        on_final=lambda t: _schedule({"type": "final", "text": t}),
        on_error=on_error_msg,
    )

    try:
        session.start()
    except Exception as e:
        await websocket.send(
            json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)
        )
        return False

    await websocket.send(json.dumps({"type": "ready"}, ensure_ascii=False))

    try:
        async for message in websocket:
            if isinstance(message, (bytes, bytearray)):
                session.feed(bytes(message))
                continue
            try:
                obj = json.loads(message)
            except (json.JSONDecodeError, TypeError):
                continue
            if obj.get("type") == "stop":
                session.stop()
                await asyncio.sleep(1.5)
                fed = getattr(session, "_fed_bytes", 0)
                print(f"[ws_asr_bridge] session stop fed={fed} partial={session._last_text!r}")
                return True
    except Exception as e:
        _schedule({"type": "error", "message": str(e)})
        return False
    finally:
        session.stop()

    return False


async def _handle_connection(websocket) -> None:
    path = getattr(getattr(websocket, "request", None), "path", "") or ""
    if path and path not in ("/", "/asr/stream"):
        await websocket.close(1008, "invalid path")
        return

    out_q: asyncio.Queue[dict] = asyncio.Queue()
    closed = asyncio.Event()

    async def _sender() -> None:
        while not closed.is_set():
            try:
                msg = await asyncio.wait_for(out_q.get(), timeout=0.15)
            except asyncio.TimeoutError:
                continue
            try:
                await websocket.send(json.dumps(msg, ensure_ascii=False))
            except Exception:
                break

    sender_task = asyncio.create_task(_sender())

    try:
        while True:
            cont = await _run_one_session(websocket, out_q)
            if not cont:
                break
    finally:
        closed.set()
        sender_task.cancel()
        try:
            await sender_task
        except asyncio.CancelledError:
            pass


def _run_ws_server(host: str, port: int) -> None:
    import websockets

    async def _main() -> None:
        async with websockets.serve(_handle_connection, host, port):
            await asyncio.Future()

    asyncio.run(_main())


def start_ws_server_thread(port: Optional[int] = None) -> threading.Thread:
    """在后台线程启动 WS 桥（daemon）。"""
    port = port or int(os.environ.get("VOICE_WS_PORT", "8001"))
    host = os.environ.get("VOICE_SERVICE_HOST", "0.0.0.0")

    def _runner() -> None:
        try:
            _run_ws_server(host, port)
        except Exception as e:
            print(f"[ws_asr_bridge] 服务异常退出：{e}")

    t = threading.Thread(target=_runner, daemon=True, name="ws-asr-bridge")
    t.start()
    print(
        f"[voice-service] WS ASR bridge ws://127.0.0.1:{port}/asr/stream "
        f"(bind={host}, multi-session=True)"
    )
    return t
