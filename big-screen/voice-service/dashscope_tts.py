"""DashScope CosyVoice 非流式 TTS（Step 2；Step 6 改流式）。"""
from __future__ import annotations

import os


def synthesize(text: str) -> tuple[bytes, str]:
    """合成单句/短段文本，返回 (audio_bytes, content_type)。"""
    api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
    if not api_key or api_key.startswith("sk-xxx"):
        raise RuntimeError(
            "DASHSCOPE_API_KEY 未配置。请在 voice-service/.env 填入百炼 API Key。"
        )

    model = (os.environ.get("DASHSCOPE_TTS_MODEL") or "cosyvoice-v3-flash").strip()
    voice = (os.environ.get("DASHSCOPE_TTS_VOICE") or "longanhuan").strip()
    if not text.strip():
        raise RuntimeError("text 为空")

    try:
        import dashscope
        from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer
    except ImportError as e:
        raise RuntimeError(
            f"缺少 dashscope SDK：{e}。请运行 pip install dashscope>=1.20.0"
        ) from e

    dashscope.api_key = api_key

    # 每次 call 前新建实例（SDK 要求）
    synthesizer = SpeechSynthesizer(
        model=model,
        voice=voice,
        format=AudioFormat.MP3_22050HZ_MONO_256KBPS,
    )
    audio = synthesizer.call(text.strip())
    if not audio:
        req_id = ""
        try:
            req_id = synthesizer.get_last_request_id() or ""
        except Exception:
            pass
        raise RuntimeError(
            f"CosyVoice 未返回音频（model={model}, voice={voice}, request_id={req_id}）。"
            f"请确认模型与音色匹配，参见百炼 CosyVoice 音色列表。"
        )
    return audio, "audio/mpeg"
