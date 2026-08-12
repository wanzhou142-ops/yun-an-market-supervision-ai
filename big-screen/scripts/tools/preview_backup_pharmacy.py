# -*- coding: utf-8 -*-
"""
预览：备份版药店数字人（全身，与 welcome/corridor 同批次）
产出 3 张：
  1) preview/backup-pharmacy-full.png    人物本体（棋盘格底，看清全身+服装）
  2) preview/backup-pharmacy-head.png    头部大图（放大 4x，确认眼睛是否睁开）
  3) preview/backup-pharmacy-scene.png   放进药店场景（模糊背景+人物），与另两场景并排对比
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from pathlib import Path

_BIG_SCREEN = Path(__file__).resolve().parents[2]
PUB = str(_BIG_SCREEN / "frontend" / "public")
OUT = str(_BIG_SCREEN / "assets" / "previews")
os.makedirs(OUT, exist_ok=True)

BACKUP = str(_BIG_SCREEN / "assets" / "avatar" / "_backup" / "avatar-pharmacy_origin.png")

FONT_PATH = "C:/Windows/Fonts/msyh.ttc"


def font(sz):
    return ImageFont.truetype(FONT_PATH, sz)


def bbox_alpha(im):
    """返回不透明像素的 bbox"""
    a = im.getchannel("A")
    return a.getbbox()


def checker(size, cell=24):
    """棋盘格背景，便于看透明边缘"""
    w, h = size
    bg = Image.new("RGB", size, (235, 235, 235))
    d = ImageDraw.Draw(bg)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2 == 0:
                d.rectangle([x, y, x + cell, y + cell], fill=(212, 212, 212))
    return bg


# ---------- 1) 全身本体 ----------
src = Image.open(BACKUP).convert("RGBA")
bb = bbox_alpha(src)
body = src.crop(bb)
bw, bh = body.size
# 统一放到高 900 展示
scale = 900 / bh
body_show = body.resize((int(bw * scale), 900), Image.LANCZOS)

canvas = checker((body_show.width + 120, 1010))
canvas.paste(body_show, (60, 60), body_show)
d = ImageDraw.Draw(canvas)
d.text((60, 16), f"备份版药店安安（全身）  原图bbox {bw}x{bh}", fill=(30, 30, 30), font=font(24))
p1 = os.path.join(OUT, "backup-pharmacy-full.png")
canvas.save(p1)
print("saved", p1, canvas.size)

# ---------- 2) 头部大图 ----------
# 头部 = bbox 顶部往下 26% 高度
hh = int(bh * 0.26)
head = body.crop((0, 0, bw, hh))
# 再横向收紧到该区域实际不透明范围
hbb = bbox_alpha(head)
head = head.crop(hbb)
head_big = head.resize((head.width * 4, head.height * 4), Image.LANCZOS)
hb = Image.new("RGB", (head_big.width + 40, head_big.height + 80), (250, 250, 250))
hb.paste(head_big, (20, 60), head_big)
d = ImageDraw.Draw(hb)
d.text((20, 16), "备份版药店安安 · 头部放大 4x（确认眼睛）", fill=(30, 30, 30), font=font(28))
p2 = os.path.join(OUT, "backup-pharmacy-head.png")
hb.save(p2)
print("saved", p2, hb.size)


# ---------- 3) 场景合成三连（模拟真实大屏） ----------
def compose(bg_path, avatar_img, title, W=760, H=428):
    """还原大屏：背景 cover + blur(5) + scale(1.08)，人物 contain 到容器高 62%，贴底居中"""
    bg = Image.open(bg_path).convert("RGB")
    # cover
    r = max(W / bg.width, H / bg.height) * 1.08
    bg = bg.resize((int(bg.width * r), int(bg.height * r)), Image.LANCZOS)
    left = (bg.width - W) // 2
    top = (bg.height - H) // 2
    bg = bg.crop((left, top, left + W, top + H))
    bg = bg.filter(ImageFilter.GaussianBlur(5 * W / 1920 * 3))  # 视觉等效模糊

    av = avatar_img
    abb = bbox_alpha(av)
    av = av.crop(abb)
    # 容器高 = min(62vh, 680px)，此处按 H 的 0.90 近似（大屏上人物占舞台高度）
    target_h = int(H * 0.90)
    s = target_h / av.height
    av = av.resize((max(1, int(av.width * s)), target_h), Image.LANCZOS)
    bg.paste(av, ((W - av.width) // 2, H - target_h - int(H * 0.03)), av)

    d = ImageDraw.Draw(bg)
    d.rectangle([0, 0, W, 40], fill=(8, 20, 39))
    d.text((14, 8), title, fill=(230, 240, 255), font=font(22))
    return bg


scenes = [
    ("scene-bg-welcome.jpg", "avatar-welcome.png", "迎宾大厅（基准）", None),
    ("scene-bg-corridor.jpg", "avatar-corridor.png", "宣传廊（基准）", None),
    ("scene-bg-pharmacy.jpg", None, "模拟药店（备份全身版）", BACKUP),
    ("scene-bg-pharmacy.jpg", "avatar-pharmacy.png", "模拟药店（现役 chibi 半身）", None),
]

tiles = []
for bgf, avf, title, override in scenes:
    av = Image.open(override if override else os.path.join(PUB, avf)).convert("RGBA")
    tiles.append(compose(os.path.join(PUB, bgf), av, title))

W, H = tiles[0].size
grid = Image.new("RGB", (W * 2 + 24, H * 2 + 24), (245, 245, 245))
for i, t in enumerate(tiles):
    grid.paste(t, ((i % 2) * (W + 24), (i // 2) * (H + 24)))
p3 = os.path.join(OUT, "backup-pharmacy-scene.png")
grid.save(p3)
print("saved", p3, grid.size)
