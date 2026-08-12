"""预览：人物大小统一（裁切 PNG 到人物 bbox 顶边）"""
from PIL import Image, ImageFilter, ImageDraw, ImageFont
import os

from pathlib import Path

_BIG_SCREEN = Path(__file__).resolve().parents[2]
CH_DIR = str(_BIG_SCREEN / "frontend" / "public")
BG_DIR = str(_BIG_SCREEN / "assets" / "avatar-bg")
OUT = str(_BIG_SCREEN / "assets" / "previews")
os.makedirs(OUT, exist_ok=True)

SCENES = [
    ("welcome.jpg",            "avatar-welcome.png",  "云安区市场监管·迎宾",       "preview-uniform-welcome.png"),
    ("corridor-overview.jpg",  "avatar-corridor.png", "云安区市场监管·宣传廊",     "preview-uniform-corridor.png"),
    ("pharmacy.jpg",           "avatar-pharmacy.png", "云安区市场监管·模拟药店",    "preview-uniform-pharmacy.png"),
]


def crop_to_avatar(im: Image.Image, pad: float = 0.06):
    """裁切 PNG：保留上下安全边 + 让三张图人物占图比例一致"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    top = bottom = left = right = None
    for y in range(h):
        for x in range(0, w, 4):
            if px[x, y][3] > 30:
                if top is None: top = y
                bottom = y
                break
    for x in range(w):
        for y in range(0, h, 4):
            if px[x, y][3] > 30:
                if left is None: left = x
                right = x
                break
    if top is None:
        return im
    pad_x = int((right - left) * pad)
    pad_y = int((bottom - top) * pad)
    new_left = max(0, left - pad_x)
    new_right = min(w, right + pad_x)
    new_top = max(0, top - pad_y)
    new_bottom = min(h, bottom + pad_y)
    return im.crop((new_left, new_top, new_right, new_bottom))


def render(bg_path, ch_path, label, outf):
    bg = Image.open(bg_path).convert("RGB")
    target_w = 960
    ratio = target_w / bg.width
    bg = bg.resize((target_w, int(bg.height * ratio)), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(5))

    # 当前模式：用原始 PNG（人物 bbox 80/89/98 各不一致）
    ch_now = Image.open(ch_path).convert("RGBA")
    # 统一模式：先用 crop_to_avatar 裁
    ch_uni = crop_to_avatar(ch_now)

    # 把两个 PNG 都按容器高 62% bg_h 缩放，水平居中、底对齐
    bg_w, bg_h = bg.size
    box_h = int(bg_h * 0.62)

    def place(ch):
        r = box_h / ch.height
        new = ch.resize((int(ch.width * r), box_h), Image.LANCZOS)
        x = (bg_w - new.width) // 2
        y = bg_h - new.height - int(bg_h * 0.04)
        return x, y, new

    # 左：当前
    left = bg.copy()
    x, y, ch = place(ch_now)
    left.paste(ch, (x, y), ch)
    # 右：统一后
    right = bg.copy()
    x, y, ch = place(ch_uni)
    right.paste(ch, (x, y), ch)

    # 左右拼接+标题
    gap = 24
    canvas_w = left.width * 2 + gap * 3
    canvas_h = left.height + 140
    canvas = Image.new("RGB", (canvas_w, canvas_h), (8, 20, 39))
    canvas.paste(left, (gap, 110))
    canvas.paste(right, (gap * 2 + left.width, 110))

    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 28)
        sf = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
    except Exception:
        font = ImageFont.load_default()
        sf = font
    draw.text((gap, 24), f"{label}", fill="#fff", font=font)
    draw.text((gap, 70),  "当前：PNG 人物上下留白不同 → 视觉大小不一", fill="#fbbf24", font=sf)
    draw.text((gap + left.width + gap, 24), f"{label} · 统一后", fill="#fff", font=font)
    draw.text((gap + left.width + gap, 70), "裁掉留白 → 三场景人物视觉同高", fill="#10b981", font=sf)

    canvas.save(os.path.join(OUT, outf), optimize=True)
    print(f"saved {outf}")


for bgf, chf, label, outf in SCENES:
    bp = os.path.join(BG_DIR, bgf)
    cp = os.path.join(CH_DIR, chf)
    if not (os.path.exists(bp) and os.path.exists(cp)):
        print(f"skip {outf}"); continue
    render(bp, cp, label, outf)
