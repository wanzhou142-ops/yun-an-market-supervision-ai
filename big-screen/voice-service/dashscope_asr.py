"""DashScope Fun-ASR 非流式 REST 识别（Step 3；Step 5 改 WebSocket 流式）。"""
from __future__ import annotations

import os
import tempfile
from http import HTTPStatus


def _detect_format(audio_bytes: bytes) -> str:
    if len(audio_bytes) >= 4 and audio_bytes[:4] == b"RIFF":
        return "wav"
    if len(audio_bytes) >= 3 and (
        audio_bytes[:3] == b"ID3"
        or (audio_bytes[0] == 0xFF and (audio_bytes[1] & 0xE0) == 0xE0)
    ):
        return "mp3"
    return "wav"


def recognize(audio_bytes: bytes) -> str:
    """识别短音频（WAV/MP3），返回识别文本（空串表示未识别到内容）。"""
    api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
    if not api_key or api_key.startswith("sk-xxx"):
        raise RuntimeError(
            "DASHSCOPE_API_KEY 未配置。请在 voice-service/.env 填入百炼 API Key。"
        )
    if not audio_bytes:
        raise RuntimeError("音频为空")

    fmt = _detect_format(audio_bytes)
    model = (os.environ.get("DASHSCOPE_ASR_MODEL") or "fun-asr-realtime").strip()
    language = (os.environ.get("DASHSCOPE_ASR_LANGUAGE") or "zh").strip()

    try:
        import dashscope
        from dashscope.audio.asr import Recognition
    except ImportError as e:
        raise RuntimeError(
            f"缺少 dashscope SDK：{e}。请运行 pip install dashscope>=1.20.0"
        ) from e

    dashscope.api_key = api_key

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        recognition = Recognition(
            model=model,
            format=fmt,
            sample_rate=16000,
            language_hints=[language],
            callback=None,
        )
        result = recognition.call(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    if result.status_code != HTTPStatus.OK:
        req_id = ""
        try:
            req_id = recognition.get_last_request_id() or ""
        except Exception:
            pass
        msg = getattr(result, "message", None) or str(result)
        raise RuntimeError(
            f"DashScope ASR 失败（model={model}, request_id={req_id}）：{msg}"
        )

    return _extract_text(result.get_sentence())


def _extract_text(sentence) -> str:
    if isinstance(sentence, list):
        parts = []
        for item in sentence:
            if isinstance(item, dict) and item.get("text"):
                parts.append(str(item["text"]).strip())
        if not parts:
            return ""
        if len(set(parts)) == 1:
            return parts[0]
        return "".join(parts).strip()
    if isinstance(sentence, dict):
        return str(sentence.get("text") or "").strip()
    return ""
