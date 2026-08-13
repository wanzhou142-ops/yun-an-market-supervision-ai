# 预生成数字人话术音频（一次性，需本机联网）
# ===========================================================================
# 从 big-screen/frontend/lib/tour-scripts.json 读取 A 类口播（与 page.tsx 同源），
# 用 edge-tts（XiaoxiaoNeural）合成 mp3 → frontend/public/audio/tts/
# 并更新 frontend/lib/tts-map.json（voice.ts 按原文精确匹配）。
#
# 用法：
#   cd big-screen/voice-service
#   pip install edge-tts   # 若未装
#   python gen_tts_audio.py
# ===========================================================================
import asyncio
import json
import os

import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"
ROOT = os.path.join(os.path.dirname(__file__), "..", "frontend")
SCRIPTS_PATH = os.path.join(ROOT, "lib", "tour-scripts.json")
OUT_DIR = os.path.join(ROOT, "public", "audio", "tts")
MAP_PATH = os.path.join(ROOT, "lib", "tts-map.json")

# 模拟药店叶子：展开 pharmacy.leaf 模板（与 tour-nav.ts leafLabel 一致）
PHARMACY_LEAF_NAMES = [
    "处方药区",
    "非处方药区",
    "中药饮片专区",
    "阴凉区",
    "食品保健食品区",
    "医疗器械区",
    "化妆品区",
    "其他产品区",
    "新特药销售区",
    "网络销售区（智慧药房）",
    "自助售药柜",
]


def collect_lines() -> list[str]:
    with open(SCRIPTS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    lines: set[str] = set()
    leaf_tpl = data.get("pharmacy.leaf", "")
    for key, text in data.items():
        if key in ("pharmacy.leaf", "pharmacy.post.leaf") or not text or not text.strip():
            continue
        lines.add(text.strip())
    if leaf_tpl:
        for name in PHARMACY_LEAF_NAMES:
            lines.add(leaf_tpl.replace("{name}", name).strip())
    post_leaf_tpl = data.get("pharmacy.post.leaf", "")
    if post_leaf_tpl:
        for name in PHARMACY_LEAF_NAMES:
            lines.add(post_leaf_tpl.replace("{leafName}", name).strip())
    return sorted(lines)


async def main():
    if not os.path.isfile(SCRIPTS_PATH):
        raise SystemExit(f"找不到 {SCRIPTS_PATH}，请先维护 tour-scripts.json")
    os.makedirs(OUT_DIR, exist_ok=True)
    lines = collect_lines()
    tts_map: dict[str, str] = {}
    for i, text in enumerate(lines, start=1):
        fname = f"line_{i:03d}.mp3"
        out = os.path.join(OUT_DIR, fname)
        comm = edge_tts.Communicate(text=text, voice=VOICE)
        with open(out, "wb") as f:
            async for chunk in comm.stream():
                if chunk.get("type") == "audio":
                    f.write(chunk["data"])
        preview = text.replace("\n", " ")[:32]
        print(f"[gen ] {fname}  {preview}...")
        tts_map[text] = fname
    with open(MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(tts_map, f, ensure_ascii=False, indent=2)
    print(f"\n完成：{len(tts_map)} 条 → {OUT_DIR}")
    print(f"映射表 → {MAP_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
