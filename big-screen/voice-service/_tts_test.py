import asyncio
import os
from pathlib import Path

import edge_tts

text = "你好，我是安安。这里是云安区市场监管普法体验基地的迎宾大厅，您想参观普法宣传廊，还是模拟药店呢？"
voice = "zh-CN-XiaoxiaoNeural"  # 女声，自然
out = Path(__file__).resolve().parent / "samples" / "an_an_welcome.mp3"


async def main():
    c = edge_tts.Communicate(text=text, voice=voice)
    await c.save(str(out))


asyncio.run(main())
print("SAVED", out, "size=", os.path.getsize(out), "bytes")
