#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数字人图片一键去背工具（白底 -> 透明）v3
========================================
改进点（v3）：
- flood-fill 阈值提升到 50（更激进）
- 边缘清理改为**多轮迭代膨胀**（3 轮，逐层向内剥）
- 新增**抗锯齿羽化**：边缘像素按距离渐变 alpha（0~255），
  消除"硬切"导致的白边/锯齿，让人物边缘自然柔和
用法：
    python tools/remove_bg.py [源图片路径] [输出路径(默认 public/avatar.png)]
"""
import sys
import numpy as np
from PIL import Image
from collections import deque
from scipy.ndimage import binary_dilation, distance_transform_edt

ROOT = "E:/xiaozhi-Requirement"
SRC = sys.argv[1] if len(sys.argv) > 1 else f"{ROOT}/DigitalHuaman.png"
DST = sys.argv[2] if len(sys.argv) > 2 else f"{ROOT}/dify-frontend/public/avatar.png"

# 1. 打开并转 RGBA
img = Image.open(SRC).convert("RGBA")
a = np.array(img)
h, w = a.shape[:2]
rgb = a[:, :, :3].astype(int)

# 2. 背景参考色 = 四角均值
corners = [rgb[2, 2], rgb[2, w - 3], rgb[h - 3, 2], rgb[h - 3, w - 3]]
bg = np.mean(corners, axis=0)

# 3. flood-fill 连通域去背（阈值 50，非常激进）
tol2 = 50 * 50
visited = np.zeros((h, w), bool)
transparent = np.zeros((h, w), bool)

seeds = []
for x in range(w):
    seeds.append((0, x))
    seeds.append((h - 1, x))
for y in range(h):
    seeds.append((y, 0))
    seeds.append((y, w - 1))

for (y, x) in seeds:
    if visited[y, x]:
        continue
    if np.sum((rgb[y, x] - bg) ** 2) > tol2:
        continue
    stack = [(y, x)]
    while stack:
        cy, cx = stack.pop()
        if cy < 0 or cx < 0 or cy >= h or cx >= w:
            continue
        if visited[cy, cx]:
            continue
        visited[cy, cx] = True
        if np.sum((rgb[cy, cx] - bg) ** 2) > tol2:
            continue
        transparent[cy, cx] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            stack.append((cy + dy, cx + dx))

# 4. 多轮边缘清理（3 轮迭代膨胀，逐层剥掉残留白边）
edge_tol2 = 55 * 55
mask = transparent.copy()
for round_num in range(3):
    neighbor = binary_dilation(mask, iterations=1, border_value=0)
    border_pixels = neighbor & ~mask
    if not border_pixels.any():
        break
    ys, xs = np.where(border_pixels)
    for y, x in zip(ys, xs):
        dist2 = np.sum((rgb[y, x] - bg) ** 2)
        if dist2 < edge_tol2:
            transparent[y, x] = True
    mask = transparent.copy()

# 5. 抗锯齿羽化：对透明/不透明边界做 alpha 渐变
#    计算每个不透明像素到最近透明像素的距离
opaque_mask = ~transparent
if transparent.any() and opaque_mask.any():
    # 到透明区域的距离（仅在不透明区域内计算）
    dist = distance_transform_edt(opaque_mask)
    # 在透明区域内部也计算到不透明的距离
    dist_trans = distance_transform_edt(transparent)
    
    # 对距离边界 <= 3px 的像素做羽化
    feather_radius = 3
    # 不透明侧：靠近边界的逐渐变透明
    boundary_opaque = (dist <= feather_radius) & opaque_mask
    if boundary_opaque.any():
        alpha_factor = np.clip(dist[boundary_opaque] / feather_radius, 0, 1).astype(float)
        out = a.copy()
        y_idx, x_idx = np.where(boundary_opaque)
        for i, (y, x) in enumerate(zip(y_idx, x_idx)):
            out[y, x, 3] = int(out[y, x, 3] * alpha_factor[i])
        
        # 应用透明区域
        out[transparent, 3] = 0
    else:
        out = a.copy()
        out[transparent, 3] = 0
else:
    out = a.copy()
    out[transparent, 3] = 0

Image.fromarray(out.astype(np.uint8), "RGBA").save(DST)

# 6. 自检
print(f"源: {SRC}")
print(f"输出: {DST}  ({w}x{h})")
print(f"背景参考色: {bg.astype(int).tolist()}")

final_alpha = out[:, :, 3]
trans_count = int((final_alpha == 0).sum())
partial_count = int(( (final_alpha > 0) & (final_alpha < 255) ).sum())
print(f"全透明: {trans_count}/{h*w} ({100*trans_count/(h*w):.1f}%)")
print(f"半透明(羽化): {partial_count}")
print(f"四角 alpha: {out[2,2,3]} {out[2,w-3,3]} {out[h-3,2,3]} {out[h-3,w-3,3]}")
cy, cx = h // 2, w // 2
print(f"中心 alpha: {out[cy,cx,3]}")
