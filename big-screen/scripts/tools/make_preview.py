from PIL import Image, ImageFilter
import os

from pathlib import Path

_BIG_SCREEN = Path(__file__).resolve().parents[2]
BG_DIR = str(_BIG_SCREEN / "assets" / "avatar-bg")
CH_DIR = str(_BIG_SCREEN / "frontend" / "public")
OUT_DIR = str(_BIG_SCREEN / "assets" / "previews")
BLUR = 5

# (背景图, 数字人透明PNG, 输出预览名)
SCENES = [
    ("welcome.jpg", "avatar-welcome.png", "preview-welcome.png"),
    ("corridor-overview.jpg", "avatar-corridor.png", "preview-corridor.png"),
    ("pharmacy.jpg", "avatar-pharmacy.png", "preview-pharmacy.png"),
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for bgf, chf, outf in SCENES:
        bg_path = os.path.join(BG_DIR, bgf)
        ch_path = os.path.join(CH_DIR, chf)
        if not (os.path.exists(bg_path) and os.path.exists(ch_path)):
            print(f"[preview] SKIP {outf}: 缺少 {bgf} 或 {chf}")
            continue
        bg = Image.open(bg_path).convert("RGB")
        bg = bg.filter(ImageFilter.GaussianBlur(BLUR))
        ch = Image.open(ch_path).convert("RGBA")

        # 数字人缩放到背景高度的 ~62%，底部对齐、水平居中
        bg_w, bg_h = bg.size
        target_h = int(bg_h * 0.62)
        ratio = target_h / ch.height
        target_w = int(ch.width * ratio)
        ch = ch.resize((target_w, target_h), Image.LANCZOS)

        pos_x = (bg_w - target_w) // 2
        pos_y = bg_h - target_h - int(bg_h * 0.04)
        bg.paste(ch, (pos_x, pos_y), ch)
        out_path = os.path.join(OUT_DIR, outf)
        bg.save(out_path)
        print(f"[preview] saved {out_path} size={bg.size}")


if __name__ == "__main__":
    main()
