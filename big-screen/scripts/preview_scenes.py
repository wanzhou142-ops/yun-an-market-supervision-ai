"""BFS 去白底 + 合成场景预览（数字人形象 + 模糊 5px 的真实背景）"""
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import os
from collections import deque

CHAR_DIR = r"E:\xiaozhi-Requirement\数字人形象"
BG_DIR = r"E:\xiaozhi-Requirement\数字人背景"
OUT_DIR = r"E:\xiaozhi-Requirement\preview"
CUTOUT_DIR = os.path.join(OUT_DIR, "cutouts")
os.makedirs(CUTOUT_DIR, exist_ok=True)

CANVAS_W, CANVAS_H = 1280, 720
TOL = 28  # BFS 颜色容差 (RGB max channel diff)


def remove_white_bg(input_path: str, output_path: str, threshold: int = 190) -> int:
    """全通道≥threshold 的像素视为 bg 候选；沿图像 4 边 BFS 找连通的背景。
    解决 4 个角颜色不一致时各角只清自己一片的问题。"""
    im = Image.open(input_path).convert("RGBA")
    arr = np.array(im).copy()
    h, w = arr.shape[:2]

    rgb = arr[:, :, :3].astype(int)
    candidate = np.all(rgb >= threshold, axis=2)  # 全通道 ≥ 阈值 → 背景候选

    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)
    q = deque()

    # 沿图像 4 边收集候选种子（覆盖整圈边界，不只是 4 角）
    seeds = []
    for x in range(w):
        if candidate[0, x]:
            seeds.append((0, x))
        if candidate[h - 1, x]:
            seeds.append((h - 1, x))
    for y in range(1, h - 1):
        if candidate[y, 0]:
            seeds.append((y, 0))
        if candidate[y, w - 1]:
            seeds.append((y, w - 1))

    for sy, sx in seeds:
        if not visited[sy, sx]:
            visited[sy, sx] = True
            q.append((sy, sx))

    while q:
        y, x = q.popleft()
        bg_mask[y, x] = True
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and candidate[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    arr[bg_mask, 3] = 0
    Image.fromarray(arr, mode="RGBA").save(output_path)
    return int(bg_mask.sum())


def make_checker_bg(w: int, h: int, cell: int = 16) -> Image.Image:
    """生成棋盘格底色，便于看透明抠图"""
    img = Image.new("RGB", (w, h), (245, 245, 245))
    d = ImageDraw.Draw(img)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                d.rectangle([x, y, x + cell, y + cell], fill=(210, 210, 210))
    return img


def cover_blur(jpg_path: str) -> Image.Image:
    """读取 jpg，cover-fit 到画布，模糊 r=5"""
    bg = Image.open(jpg_path).convert("RGB")
    bw, bh = bg.size
    bg_aspect = bw / bh
    canvas_aspect = CANVAS_W / CANVAS_H
    if bg_aspect > canvas_aspect:
        new_h = CANVAS_H
        new_w = int(new_h * bg_aspect)
    else:
        new_w = CANVAS_W
        new_h = int(new_w / bg_aspect)
    bg = bg.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - CANVAS_W) // 2
    top = (new_h - CANVAS_H) // 2
    bg = bg.crop((left, top, left + CANVAS_W, top + CANVAS_H))
    return bg.filter(ImageFilter.GaussianBlur(radius=5))


def fit_on_canvas(char: Image.Image, target_h_ratio: float = 0.82) -> Image.Image:
    """等比缩放到画布高度的指定比例"""
    target_h = int(CANVAS_H * target_h_ratio)
    ratio = target_h / char.height
    target_w = int(char.width * ratio)
    return char.resize((target_w, target_h), Image.LANCZOS)


scenes = [
    ("welcome",  "welcome.png",           "welcome.jpg"),
    ("corridor", "corridor-overview.png", "corridor-overview.jpg"),
    ("pharmacy", "pharmacy.png",          "pharmacy.jpg"),
]

print("== 步骤 1: BFS 去白底，输出到 preview/cutouts ==")
for scene, char_name, _ in scenes:
    src = os.path.join(CHAR_DIR, char_name)
    dst = os.path.join(CUTOUT_DIR, char_name)
    removed = remove_white_bg(src, dst)
    print(f"  [{scene}] {char_name}  去除像素={removed:,}")

print("\n== 步骤 2: 抠图合成预览 + 棋盘格预览 ==")
for scene, char_name, bg_name in scenes:
    # 抠图
    cutout = Image.open(os.path.join(CUTOUT_DIR, char_name)).convert("RGBA")
    char_resized = fit_on_canvas(cutout)

    # --- 合成 A: 模糊背景 + 数字人 ---
    blurred_bg = cover_blur(os.path.join(BG_DIR, bg_name))
    canvas_a = blurred_bg.copy()
    cx = CANVAS_W - char_resized.width - 60
    cy = (CANVAS_H - char_resized.height) // 2
    canvas_a.paste(char_resized, (cx, cy), char_resized)
    out_a = os.path.join(OUT_DIR, f"preview-{scene}.png")
    canvas_a.save(out_a, optimize=True)

    # --- 合成 B: 棋盘格 + 数字人（看抠图是否干净）---
    checker = make_checker_bg(CANVAS_W, CANVAS_H, cell=20)
    canvas_b = checker.copy()
    canvas_b.paste(char_resized, (cx, cy), char_resized)
    out_b = os.path.join(OUT_DIR, f"cutout-checker-{scene}.png")
    canvas_b.save(out_b, optimize=True)

    print(f"  [{scene}] -> {out_a}")
    print(f"  [{scene}] -> {out_b}")

print("\ndone")