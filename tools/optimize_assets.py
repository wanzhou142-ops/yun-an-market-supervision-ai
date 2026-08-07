# -*- coding: utf-8 -*-
"""
大屏资产瘦身：解决场景切换偶发卡顿。

原因：public 下的背景是手机原图 4032x3024（单张解码占 46MB 显存），数字人
透明 PNG 是 1344x3168（单张 16MB）。场景交叉淡化时新旧两层同时在内存，叠加
CSS blur / drop-shadow 需要的中间纹理，极易撑爆 GPU 缓存导致回退 CPU 光栅化
—— 表现就是「偶尔卡一下」。

处理（只改像素尺寸，不改构图/比例/模糊程度，视觉零变化）：
  - 背景 -> cover 裁剪到 1920x1080，JPEG q86（CSS 仍做 blur(5px)，模糊程度不变）
  - 数字人 -> 等比缩到高 1200px（CSS 显示上限 min(62vh,560px)，1200 足够 2x DPR）
    不做透明边裁剪，避免改变 object-fit: contain 下的人物大小。

原图已备份在 assets-original/。重跑本脚本会从备份重新生成，可反复执行。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-original"
OUT = ROOT / "dify-frontend" / "public"

BG_W, BG_H = 1920, 1080          # 背景目标尺寸（cover 裁剪）
AVATAR_H = 1200                  # 数字人目标高度（等比）


def cover_resize(im: Image.Image, tw: int, th: int) -> Image.Image:
    """等比缩放并居中裁剪到 tw x th（等价 CSS object-fit: cover）。"""
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def mb(p: Path) -> float:
    return p.stat().st_size / 1024 / 1024


def main() -> None:
    print(f"源: {SRC}\n出: {OUT}\n")

    for name in ["scene-bg-welcome.jpg", "scene-bg-corridor.jpg", "scene-bg-pharmacy.jpg"]:
        src, dst = SRC / name, OUT / name
        if not src.exists():
            print(f"[跳过] 缺少备份 {src}")
            continue
        im = Image.open(src).convert("RGB")
        before_px, before_mb = im.size, mb(src)
        im = cover_resize(im, BG_W, BG_H)
        im.save(dst, "JPEG", quality=86, optimize=True, progressive=True)
        print(f"[背景] {name}: {before_px} {before_mb:.2f}MB -> {im.size} {mb(dst):.2f}MB "
              f"| 显存 {before_px[0]*before_px[1]*4/1024/1024:.0f}MB -> {BG_W*BG_H*4/1024/1024:.0f}MB")

    for name in ["avatar-welcome.png", "avatar-corridor.png", "avatar-pharmacy.png"]:
        src, dst = SRC / name, OUT / name
        if not src.exists():
            print(f"[跳过] 缺少备份 {src}")
            continue
        im = Image.open(src).convert("RGBA")
        before_px, before_mb = im.size, mb(src)
        if im.height > AVATAR_H:
            nw = round(im.width * AVATAR_H / im.height)
            im = im.resize((nw, AVATAR_H), Image.LANCZOS)
        im.save(dst, "PNG", optimize=True)
        print(f"[数字人] {name}: {before_px} {before_mb:.2f}MB -> {im.size} {mb(dst):.2f}MB "
              f"| 显存 {before_px[0]*before_px[1]*4/1024/1024:.1f}MB -> {im.width*im.height*4/1024/1024:.1f}MB")


if __name__ == "__main__":
    main()
