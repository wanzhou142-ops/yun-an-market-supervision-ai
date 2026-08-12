"""预览：子分区按钮从左侧挪到右侧（每个场景）"""
import os
import sys
from PIL import Image, ImageFilter, ImageDraw, ImageFont

from pathlib import Path

_BIG_SCREEN = Path(__file__).resolve().parents[2]
BG_DIR = str(_BIG_SCREEN / "assets" / "avatar-bg")
AV_DIR = str(_BIG_SCREEN / "frontend" / "public")
OUT = str(_BIG_SCREEN / "assets" / "previews")
os.makedirs(OUT, exist_ok=True)

# 单独加载字体，任一失败都硬报错
def F(size, bold=False):
    p = "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"
    return ImageFont.truetype(p, size)

F_BIG = F(26, bold=True)
F_MID = F(20)
F_KW  = F(14)
F_CHIP = F(20, bold=True)
F_EMOJI = ImageFont.truetype("C:/Windows/Fonts/seguiemj.ttf", 38)

SCENES = [
    {
        "label": "云安区市场监管·迎宾大厅",
        "sub":   "综合培训法治教育基地·迎宾大厅",
        "bg":    "welcome.jpg",
        "avatar": "avatar-welcome.png",
        "chips": [],
        "active": "迎宾",
        "out":   "preview-chips-right-welcome.png",
    },
    {
        "label": "云安区市场监管·宣传廊",
        "sub":   "综合培训法治教育基地·宣传廊",
        "bg":    "corridor-overview.jpg",
        "avatar": "avatar-corridor.png",
        "chips": ["器械专区", "化妆品专区", "药品专区"],
        "active": "宣传",
        "out":   "preview-chips-right-corridor.png",
    },
    {
        "label": "云安区市场监管·模拟药店",
        "sub":   "综合培训法治教育基地·模拟药店",
        "bg":    "pharmacy.jpg",
        "avatar": "avatar-pharmacy.png",
        "chips": ["传统药房区", "新零售模式区"],
        "active": "模拟",
        "out":   "preview-chips-right-pharmacy.png",
    },
]

HINTS = {
    "pharmacy": "点右下角麦克风与安安对话 · 可以说「传统药房区」「新零售模式区」",
    "corridor": "点右下角麦克风与安安对话 · 可以说「器械专区」「化妆品专区」「药品专区」",
    "welcome":  "点右下角麦克风与安安对话 · 可以说「去宣传廊」「去模拟药店」",
}


def draw_topbar(draw, w, label, sub, active):
    # 顶栏深色底
    draw.rectangle([0, 0, w, 86], fill=(8, 20, 39))
    draw.ellipse([24, 22, 58, 56], fill=(96, 165, 250))
    draw.text((72, 18), label, fill=(255, 255, 255), font=F_BIG)
    draw.text((72, 50), sub, fill=(176, 198, 230), font=F_KW)

    # 右上 3 个圆角场景按钮
    btns = [("迎宾", "迎宾"), ("宣传", "宣传"), ("模拟", "模拟")]
    bx = w - 28
    for i in range(2, -1, -1):
        text, _ = btns[i]
        bw = 92
        x0 = bx - bw - (2 - i) * (bw + 8)
        is_act = (text == active)
        fill = (96, 165, 250) if is_act else (28, 50, 80)
        draw.rounded_rectangle([x0, 22, x0 + bw, 64], radius=21, fill=fill)
        bb = draw.textbbox((0, 0), text, font=F_MID)
        draw.text((x0 + (bw - (bb[2] - bb[0])) // 2, 30), text, fill=(255, 255, 255), font=F_MID)


def draw_chips_right(draw, w, h, chips):
    """右侧竖排：屏幕中段、底部避开右下麦克风（fab.top = h-100）"""
    if not chips:
        return
    cw, ch_ = 188, 52
    cx = w - cw - 20
    # 整体垂直区间：fab 顶之上 16px 留出 → chip 总高 = n*52 + (n-1)*14
    total = len(chips) * ch_ + (len(chips) - 1) * 14
    fab_top = h - 100  # = h - 100 - 72
    max_cy = fab_top - 16 - total
    cy = max(120, min(int(h * 0.42), max_cy))
    for i, name in enumerate(chips):
        y0 = cy + i * (ch_ + 14)
        draw.rounded_rectangle(
            [cx, y0, cx + cw, y0 + ch_], radius=26,
            fill=(0, 0, 0), outline=(255, 255, 255), width=2,
        )
        bb = draw.textbbox((0, 0), name, font=F_CHIP)
        tw = bb[2] - bb[0]
        draw.text((cx + (cw - tw) // 2, y0 + 13), name, fill=(255, 255, 255), font=F_CHIP)


def draw_fab(draw, w, h):
    fd = 72
    fx, fy = w - 60 - fd, h - 100 - fd
    # 浅色光晕
    draw.ellipse([fx - 10, fy - 10, fx + fd + 10, fy + fd + 10], fill=(96, 165, 250))
    draw.ellipse([fx, fy, fx + fd, fy + fd], fill=(14, 165, 233))
    # 麦克风 emoji（seguiemj 才有）
    bb = draw.textbbox((0, 0), "🎤", font=F_EMOJI)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.text((fx + (fd - tw) // 2 - bb[0], fy + (fd - th) // 2 - bb[1] - 4), "🎤", fill=(255, 255, 255), font=F_EMOJI)


def draw_hint(draw, w, h, hint):
    bx0, bx1 = (w - 720) // 2, (w + 720) // 2
    by0, by1 = h - 80, h - 32
    draw.rounded_rectangle([bx0, by0, bx1, by1], radius=22, fill=(0, 0, 0, 165))
    bb = draw.textbbox((0, 0), hint, font=F_KW)
    tw = bb[2] - bb[0]
    draw.text(((w - tw) // 2, by0 + 12), hint, fill=(255, 255, 255), font=F_KW)


def draw_exit(draw, w, h):
    if w < 800:  # 仅当交互模式（这里始终 interactive）
        pass
    bw, bh = 130, 42
    x0, y0 = 24, h - 110
    draw.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=21,
                           fill=(0, 0, 0, 140), outline=(255, 255, 255), width=2)
    draw.text((x0 + 18, y0 + 8), "← 返回视频", fill=(255, 255, 255), font=F_MID)


def render(scene):
    bg = Image.open(os.path.join(BG_DIR, scene["bg"])).convert("RGB")
    target_w = 960
    bg = bg.resize((target_w, int(bg.height * target_w / bg.width)), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(5))
    bg_w, bg_h = bg.size

    av = Image.open(os.path.join(AV_DIR, scene["avatar"])).convert("RGBA")
    box_h = int(bg_h * 0.62)
    ratio = box_h / av.height
    av = av.resize((int(av.width * ratio), box_h), Image.LANCZOS)
    pos_x = (bg_w - av.width) // 2
    pos_y = bg_h - av.height - int(bg_h * 0.04)
    bg.paste(av, (pos_x, pos_y), av)

    draw = ImageDraw.Draw(bg)
    draw_topbar(draw, bg_w, scene["label"], scene["sub"], scene["active"])

    # 根据场景名出 hint
    key = "pharmacy" if "pharmacy" in scene["out"] else \
          "corridor" if "corridor" in scene["out"] else "welcome"
    draw_hint(draw, bg_w, bg_h, HINTS[key])
    draw_fab(draw, bg_w, bg_h)
    draw_chips_right(draw, bg_w, bg_h, scene["chips"])
    draw_exit(draw, bg_w, bg_h)

    out_path = os.path.join(OUT, scene["out"])
    bg.save(out_path, optimize=True)
    print(f"[OK] {scene['out']}  {bg.size}")


for s in SCENES:
    render(s)
