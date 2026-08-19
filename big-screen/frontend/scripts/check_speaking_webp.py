"""核验 speaking.webp 的透明质量：
1) alpha 是否真保留（解码 RGBA，看 alpha 通道分布）
2) 主体内部有无透明洞（白衣被抠穿）
3) 边缘有无白边（alpha 半透区是否残留白色）
4) 循环首尾帧是否接近（无缝）
"""
import sys, os
import numpy as np
from PIL import Image
import subprocess

FF = r"C:/Users/Lenovo/.workbuddy/binaries/ffmpeg/ffmpeg.exe"
PY = r"C:/Users/Lenovo/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
WEBP = r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-states/speaking.webp"
TMP = r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-states/raw/_check"

os.makedirs(TMP, exist_ok=True)

def decode_frame(t=None, idx=None, out="f.png"):
    if t is not None:
        cmd = [FF, "-y", "-loglevel", "error", "-ss", str(t), "-i", WEBP,
               "-pix_fmt", "rgba", "-frames:v", "1", os.path.join(TMP, out)]
    else:
        cmd = [FF, "-y", "-loglevel", "error", "-i", WEBP,
               "-vf", f"select=eq(n\\,{idx})", "-pix_fmt", "rgba",
               "-frames:v", "1", os.path.join(TMP, out)]
    subprocess.run(cmd, check=True)
    a = np.asarray(Image.open(os.path.join(TMP, out))).astype(int)
    return a

# get frame count / duration
p = subprocess.run([FF, "-i", WEBP], capture_output=True, text=True)
info = p.stderr
print("=== file info ===")
for line in info.splitlines():
    if any(k in line.lower() for k in ["duration", "video:", "stream"]):
        print(" ", line.strip())

# decode first and last frames
f0 = decode_frame(t=0, out="f0.png")
print(f"\nfirst frame: {f0.shape}, RGBA mean=({f0[...,0].mean():.0f},{f0[...,1].mean():.0f},{f0[...,2].mean():.0f},{f0[...,3].mean():.0f})")
alpha = f0[..., 3]
print(f"alpha: min={alpha.min()} max={alpha.max()} mean={alpha.mean():.0f} | transparent(<10)={100*(alpha<10).mean():.1f}% opaque(>245)={100*(alpha>245).mean():.1f}%")

# subject region = opaque, check for holes inside (transparent pixels inside opaque bbox)
opaque = alpha > 200
if opaque.sum() > 50:
    rows = np.any(opaque, axis=1)
    cols = np.any(opaque, axis=0)
    y0, y1 = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
    x0, x1 = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])
    # dilate bbox inward by 5px to avoid edge
    sub_alpha = alpha[y0+5:y1-5, x0+5:x1-5]
    holes = (sub_alpha < 30).sum()
    total = sub_alpha.size
    print(f"subject bbox: x[{x0}-{x1}] y[{y0}-{y1}], inner transparent holes: {holes}/{total} = {100*holes/total:.2f}%")
else:
    print("WARNING: no opaque subject found!")

# edge white residue: check pixels with 30<alpha<200 (semi-trans) — are they whitish?
semi = (alpha > 30) & (alpha < 200)
if semi.sum() > 0:
    semi_rgb = f0[..., :3][semi]
    whiteness = semi_rgb.mean()
    print(f"semi-trans edge pixels: {semi.sum()}, avg RGB={whiteness:.0f} (>200=white residue risk)")

# loop seam: compare first vs last frame RGB
# need last frame — decode at duration-0.1
import re
m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", info)
if m:
    hh, mm, ss = int(m.group(1)), int(m.group(2)), float(m.group(3))
    dur = hh*3600 + mm*60 + ss
    fl = decode_frame(t=max(0, dur-0.08), out="fl.png")
    # compare on opaque region of both
    a0 = f0[..., :3]
    al = fl[..., :3]
    diff = np.abs(a0.astype(int) - al.astype(int)).mean()
    print(f"loop seam: first vs last frame mean RGB diff = {diff:.1f} (<5=seamless, >15=visible jump)")

# cleanup
for f in ["f0.png", "fl.png"]:
    try: os.remove(os.path.join(TMP, f))
    except: pass
try: os.rmdir(TMP)
except: pass
print("\n(check done)")
