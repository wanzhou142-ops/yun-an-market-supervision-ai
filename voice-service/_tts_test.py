import asyncio, edge_tts, sys
text = "你好，我是安安。这里是云安区市场监管普法体验基地的迎宾大厅，您想参观普法宣传廊，还是模拟药店呢？"
voice = "zh-CN-XiaoxiaoNeural"  # 女声，自然
out = "E:/xiaozhi-Requirement/voice-service/samples/an_an_welcome.mp3"
async def main():
    c = edge_tts.Communicate(text=text, voice=voice)
    await c.save(out)
asyncio.run(main())
import os
print("SAVED", out, "size=", os.path.getsize(out), "bytes")
