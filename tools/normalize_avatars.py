"""方案A：把三个数字人去背源图的人物统一重排到相同画布。
- 测量每张图人物的 alpha 真实包围盒
- 统一人物显示高度 = 三者最大包围盒高
- 脚底对齐同一基线、水平居中
- 输出预览图到 tools/_tmp_normalized/（不改 public/）
依赖：PIL、numpy（rembg venv 已具备）
"""
import os
from PIL import Image
import numpy as np

SRC = {
    "welcome": r"E:/xiaozhi-Requirement/assets-original/avatar-welcome.png",
    "corridor": r"E:/xiaozhi-Requirement/assets-original/avatar-corridor.png",
    "pharmacy": r"E:/xiaozhi-Requirement/assets-original/avatar-pharmacy.png",
}
OUTDIR = r"E:/xiaozhi-Requirement/tools/_tmp_normalized"
os.makedirs(OUTDIR, exist_ok=True)

# ---- 1) 测量 alpha 包围盒 ----
metrics = {}
print("=== 1) 测量每张图人物真实包围盒（alpha>10） ===")
for name, path in SRC.items():
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    alpha = np.array(im)[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(xs) == 0:
        print(f"  {name}: 无 alpha，跳过")
        continue
    left, right = int(xs.min()), int(xs.max())
    top, bottom = int(ys.min()), int(ys.max())
    bw, bh = right - left + 1, bottom - top + 1
    metrics[name] = dict(w=w, h=h, left=left, top=top, right=right,
                         bottom=bottom, bw=bw, bh=bh)
    print(f"  {name}: 画布 {w}x{h} | 人物bbox=({left},{top})-({right},{bottom}) "
          f"宽{bw} 高{bh} | 上留白{top} 下留白{h-bottom} 左留白{left} 右留白{w-right}")

# ---- 2) 统一规范参数 ----
H = 1300
max_bh = max(m["bh"] for m in metrics.values())
PH = min(max_bh, H - 80)            # 上下各至少留 40
resize_w = {n: m["bw"] * PH / m["bh"] for n, m in metrics.items()}
max_rw = max(resize_w.values())
W = int(round(max_rw)) + 80         # 左右各留 40
foot_margin = 40
top_y = H - PH - foot_margin        # 人物粘贴 top
print(f"\n=== 2) 统一规范 ===")
print(f"  画布 {W}x{H} | 人物统一显示高 PH={PH} | 脚底基线 y={top_y+PH} | 头顶 y={top_y}")

# ---- 3) 生成规范化图 ----
print("\n=== 3) 生成规范化图 ===")
normalized = {}
for name, path in SRC.items():
    im = Image.open(path).convert("RGBA")
    m = metrics[name]
    crop = im.crop((m["left"], m["top"], m["right"] + 1, m["bottom"] + 1))
    rw = int(round(m["bw"] * PH / m["bh"]))
    crop = crop.resize((rw, PH), Image.LANCZOS)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = (W - rw) // 2
    canvas.paste(crop, (x, top_y), crop)
    out = os.path.join(OUTDIR, f"normalized_{name}.png")
    canvas.save(out, "PNG")
    normalized[name] = out
    print(f"  {name}: 保存到 {out} | 人物 x={x}..{x+rw} y={top_y}..{top_y+PH}")

# ---- 4) 对比拼图预览 ----
print("\n=== 4) 生成对比拼图 ===")
gap = 30
total_w = sum(W for _ in metrics) + gap * (len(metrics) - 1)
sheet = Image.new("RGBA", (total_w, H + 40), (235, 235, 235, 255))
xoff = 0
for name in SRC:
    im = Image.open(normalized[name])
    sheet.paste(im, (xoff, 20), im)
    xoff += W + gap
cmp = os.path.join(OUTDIR, "compare.png")
sheet.save(cmp, "PNG")
print(f"  对比拼图: {cmp} 尺寸 {sheet.size}")
print("\n完成。未改动 public/。")
