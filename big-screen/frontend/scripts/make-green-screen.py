"""
将 3 张数字人原图合成到 650×1300 纯绿幕 (#00FF00) 上，喂给图生视频工具。

输入: public/avatar-welcome.png / avatar-corridor.png / avatar-pharmacy.png
       (650×1300 RGBA，透明背景，约 45% 区域有内容)
输出: public/avatar-videos/raw/avatar-{welcome,corridor,pharmacy}-green.png

兼容: 源图若是 RGB 白底，会先把近白像素 (R,G,B 都 > 240) 转透明再贴。
"""
import os
from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")
OUT_DIR = os.path.join(PUBLIC_DIR, "avatar-videos", "raw")
CANVAS_W, CANVAS_H = 650, 1300
GREEN = (0, 255, 0, 255)  # #00FF00

SOURCES = ["avatar-welcome.png", "avatar-corridor.png", "avatar-pharmacy.png"]


def to_rgba(im: Image.Image) -> Image.Image:
    """统一为 RGBA；RGB 白底则把近白像素转透明。"""
    if im.mode == "RGBA":
        return im
    if im.mode != "RGB":
        im = im.convert("RGB")
    # 白色背景 → 透明
    pixels = im.load()
    w, h = im.size
    new = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out = new.load()
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            if r > 240 and g > 240 and b > 240:
                out[x, y] = (0, 0, 0, 0)
            else:
                out[x, y] = (r, g, b, 255)
    return new


def composite(src_path: str, dst_path: str) -> tuple[int, int]:
    im = Image.open(src_path)
    if im.size != (CANVAS_W, CANVAS_H):
        print(f"  warn: resize {im.size} -> {(CANVAS_W, CANVAS_H)}")
        im = im.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)
    rgba = to_rgba(im)
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), GREEN)
    canvas.alpha_composite(rgba)
    canvas.save(dst_path, "PNG", optimize=True)
    return im.size, os.path.getsize(dst_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in SOURCES:
        src = os.path.join(PUBLIC_DIR, name)
        stem = os.path.splitext(name)[0]
        dst = os.path.join(OUT_DIR, f"{stem}-green.png")
        size, bytes_ = composite(src, dst)
        print(f"[ok] {name} -> {os.path.relpath(dst, PROJECT_ROOT)}  ({size[0]}x{size[1]}, {bytes_} bytes)")


if __name__ == "__main__":
    main()
