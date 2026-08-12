# 预生成数字人话术音频（一次性，需本机联网）
# ===========================================================================
# 用 edge-tts（微软 XiaoxiaoNeural，自然女声）把前端所有固定播报话术
# 一次性合成为 mp3，落到 dify-frontend/public/audio/tts/。
# 前端优先播本地音频：发音标准 + 零合成延迟 + 离线可用（打包进 deploy）。
# 仅本机生成阶段需要联网；生成后客户机完全离线。
#
# 用法：
#   cd voice-service
#   ..\...venv python gen_tts_audio.py
# ===========================================================================
import asyncio
import json
import os
import edge_tts

NAME = "安安"
VOICE = "zh-CN-XiaoxiaoNeural"
OUT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "dify-frontend", "public", "audio", "tts"
)
MAP_PATH = os.path.join(
    os.path.dirname(__file__), "..", "dify-frontend", "lib", "tts-map.json"
)

GENDER_WORDS = {"male": "先生", "female": "女士", "neutral": "您"}


def gender_word(g):
    return GENDER_WORDS[g]


def greeting_line(g):
    if g == "neutral":
        return (
            f"您好，我是{NAME}，云安市场监管普法迎宾助手。"
            f"请问您今天想参观宣传廊，还是模拟药店呢？"
        )
    return (
        f"你好，{gender_word(g)}，我是{NAME}，云安市场监管普法迎宾助手。"
        f"请问您今天想参观宣传廊，还是模拟药店呢？"
    )


def guidance_line(g):
    return (
        f"抱歉，{gender_word(g)}，我是{NAME}，主要负责带您参观。"
        f"您可以告诉我想去宣传廊还是模拟药店，或者说“返回”回到迎宾大厅。"
    )


def welcome_line():
    return (
        f"您好，我是{NAME}，云安市场监管普法迎宾助手。"
    )


def name_reply(g):
    if g == "neutral":
        return "您好！请问您想参观宣传廊，还是模拟药店？"
    return f"{gender_word(g)}，您好！请问您想参观宣传廊，还是模拟药店？"


def script_for(s, g):
    scene = s["scene"]
    aspect = s.get("aspect")
    zone = s.get("zone")
    if scene == "welcome":
        return greeting_line(g)
    if scene == "corridor":
        if not aspect:
            return (
                f"欢迎来到普法宣传廊，{gender_word(g)}。"
                f"您想重点了解哪方面？可以说器械、化妆品，或者药品。"
            )
        if aspect == "device":
            return (
                "这是医疗器械专区。医疗器械需依法注册备案，选购请认准注册证编号。"
                "您还可以了解化妆品或药品，或者说“返回”回到迎宾。"
            )
        if aspect == "cosmetic":
            return (
                "这是化妆品专区。选购化妆品请认准批准文号，警惕虚假宣传。"
                "您还可以了解器械或药品，或者说“返回”回到迎宾。"
            )
        if aspect == "drug":
            return (
                "这是药品专区。请注意处方药须凭医师处方购买，"
                "区分药品与非药品、处方药与非处方药。"
                "您还可以了解器械或化妆品，或者说“返回”回到迎宾。"
            )
    if scene == "pharmacy":
        if not zone:
            return (
                f"这里是模拟药店体验区，{gender_word(g)}。"
                f"想看看传统药房区，还是新零售模式区？"
            )
        if zone == "traditional":
            return (
                "这是传统药房区。请留意处方药销售是否合规、是否有执业药师在岗。"
                "您可以说“返回”回到迎宾。"
            )
        if zone == "newretail":
            return (
                "这是新零售模式区。自助售药同样须遵守药品经营规范。"
                "您可以说“返回”回到迎宾。"
            )
    return "请问有什么可以帮您？"


def collect_lines():
    lines = set()
    nav_states = [{"scene": "welcome", "aspect": None, "zone": None}]
    for a in [None, "device", "cosmetic", "drug"]:
        nav_states.append({"scene": "corridor", "aspect": a, "zone": None})
    for z in [None, "traditional", "newretail"]:
        nav_states.append({"scene": "pharmacy", "aspect": None, "zone": z})
    for g in GENDER_WORDS:
        lines.add(greeting_line(g))
        lines.add(guidance_line(g))
        lines.add(name_reply(g))
        for s in nav_states:
            lines.add(script_for(s, g))
    lines.add(welcome_line())
    return sorted(lines)


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    lines = collect_lines()
    tts_map = {}
    for i, text in enumerate(lines, start=1):
        fname = f"line_{i:03d}.mp3"
        out = os.path.join(OUT_DIR, fname)
        # 强制覆盖（不因"文件已存在"而跳过），保证话术文本改动后音频与映射表同步刷新
        comm = edge_tts.Communicate(text=text, voice=VOICE)
        with open(out, "wb") as f:
            async for chunk in comm.stream():
                if chunk.get("type") == "audio":
                    f.write(chunk["data"])
        print(f"[gen ] {fname}  {text[:24]}...")
        tts_map[text] = fname
    with open(MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(tts_map, f, ensure_ascii=False, indent=2)
    print(f"\n完成：{len(tts_map)} 条话术 → {OUT_DIR}")
    print(f"映射表 → {MAP_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
