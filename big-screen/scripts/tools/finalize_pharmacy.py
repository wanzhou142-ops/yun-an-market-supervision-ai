# -*- coding: utf-8 -*-
"""
把「图生图睁眼版」全身药店安安落地为与另两张一致的 avatar-pharmacy.png 候选，
并生成三场景真实渲染比例对比图供确认。

- 候选处理：与 optimize_assets.py 一致（等比缩到高 1200，不裁透明边），
  保持全身取景，避免再次出现「半身贴脸/太靠前」。
- 预览：模拟 CSS .avatar-stack(height=min(62vh,680px)) + object-fit:contain +
  底对齐，把三张 avatar 分别叠到各自模糊背景上，横排对比真实视觉大小。
"""
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw, ImageFont
import numpy as np

BIG_SCREEN = Path(__file__).resolve().parents[2]
PUB = BIG_SCREEN / "frontend" / "public"
TMP = Path(__file__).resolve().parent / "_tmp"
OUT = BIG_SCREEN / "assets" / "previews"
OUT.mkdir(exist_ok=True)

NEW_CUT = TMP / "pharmacy_openeye_cut.png"
CANDIDATE = TMP / "avatar-pharmacy_candidate.png"
AVATAR_H = 1200


def measure(im: Image.Image):
    im = im.convert("RGBA")
    w, h = im.size
    al = np.array(im)[:, :, 3]
    ys, xs = np.where(al > 30)
    top, bot, left, right = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
    ph, pw = bot - top, right - left

    def span(yy):
        idx = np.where(al[yy] > 30)[0]
        return int(idx.max() - idx.min()) if len(idx) else 0

    hw = span(top + int(ph * 0.08))
    return dict(img=(w, h), bbox=(pw, ph), occ_h=ph / h * 100, head=hw / ph,
                top=top, bot=bot, left=left, right=right)


def make_candidate():
    im = Image.open(NEW_CUT).convert("RGBA")
    if im.height > AVATAR_H:
        nw = round(im.width * AVATAR_H / im.height)
        im = im.resize((nw, AVATAR_H), Image.LANCZOS)
    im.save(CANDIDATE, "PNG", optimize=True)
    return CANDIDATE


def scene_panel(bg_path, avatar_path, title, box_ratio=0.62):
    """单场景真实渲染：背景模糊 + 数字人 object-fit:contain 底对齐"""
    W = 640
    bg = Image.open(bg_path).convert("RGB")
    r = W / bg.width
    bg = bg.resize((W, int(bg.height * r)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(5))
    Wb, Hb = bg.size
    box_h = int(Hb * box_ratio)  # 容器高（模拟 62vh）
    av = Image.open(avatar_path).convert("RGBA")
    # object-fit: contain -> 按容器高缩放（宽自适应），底对齐
    rr = box_h / av.height
    av = av.resize((int(av.width * rr), box_h), Image.LANCZOS)
    x = (Wb - av.width) // 2
    y = Hb - av.height - int(Hb * 0.04)
    panel = bg.copy()
    panel.paste(av, (x, y), av)
    d = ImageDraw.Draw(panel)
    try:
        f = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 22)
    except Exception:
        f = ImageFont.load_default()
    # 顶部标题条
    d.rectangle([0, 0, Wb, 40], fill=(8, 20, 39))
    d.text((14, 8), title, fill=(255, 255, 255), font=f)
    return panel


def main():
    print("=== 量三张图（welcome / corridor / 新药店去背）===")
    trio = [
        ("welcome", PUB / "avatar-welcome.png"),
        ("corridor", PUB / "avatar-corridor.png"),
        ("new-pharmacy", NEW_CUT),
    ]
    for name, f in trio:
        d = measure(Image.open(f))
        print(f"{name:<14} img{d['img']} bbox{d['bbox']} occ_h {d['occ_h']:.0f}% head/body {d['head']:.3f}")

    print("\n=== 生成候选 avatar-pharmacy（高1200，全身取景）===")
    cand = make_candidate()
    dc = measure(Image.open(cand))
    print(f"candidate      img{dc['img']} bbox{dc['bbox']} occ_h {dc['occ_h']:.0f}% head/body {dc['head']:.3f}")

    print("\n=== 生成三场景真实渲染对比 ===")
    panels = [
        scene_panel(PUB / "scene-bg-welcome.jpg", PUB / "avatar-welcome.png", "迎宾大厅"),
        scene_panel(PUB / "scene-bg-corridor.jpg", PUB / "avatar-corridor.png", "宣传廊"),
        scene_panel(PUB / "scene-bg-pharmacy.jpg", cand, "模拟药店(新·睁眼全身)"),
    ]
    gap = 16
    cw = sum(p.width for p in panels) + gap * (len(panels) + 1)
    ch = max(p.height for p in panels) + gap * 2
    canvas = Image.new("RGB", (cw, ch), (8, 20, 39))
    x = gap
    for p in panels:
        canvas.paste(p, (x, gap))
        x += p.width + gap
    out = OUT / "three-scenes-compare.png"
    canvas.save(out, optimize=True)
    print(f"saved {out}")


if __name__ == "__main__":
    main()
