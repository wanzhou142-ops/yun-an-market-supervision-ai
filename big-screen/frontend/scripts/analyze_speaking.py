import numpy as np
from PIL import Image
from pathlib import Path

D = Path(r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-videos/raw")
fs = sorted(D.glob("speak_f*.png"))
ys = []  # per-frame metric
for p in fs:
    a = np.asarray(Image.open(p).convert("RGB")).astype(int)
    H, W, _ = a.shape
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    white = (R > 235) & (G > 235) & (B > 235)
    subj = ~white
    if subj.sum() < 50:
        ys.append((p.name, None, None, None)); continue
    yidx = np.where(subj.any(axis=1))[0]
    xidx = np.where(subj.any(axis=0))[0]
    y0, y1 = int(yidx.min()), int(yidx.max())
    x0, x1 = int(xidx.min()), int(xidx.max())
    bh, bw = y1 - y0, x1 - x0
    # mouth region: lower-center of subject bbox
    my0 = y0 + int(bh * 0.60); my1 = y0 + int(bh * 0.74)
    mx0 = x0 + int(bw * 0.38); mx1 = x0 + int(bw * 0.62)
    mouth = (R[my0:my1, mx0:mx1] < 110) & (G[my0:my1, mx0:mx1] < 85) & (B[my0:my1, mx0:mx1] < 85)
    mc = int(mouth.sum())
    ys.append((p.name, (y0, y1, x0, x1), (bh, bw), mc))

print(f"frames={len(ys)}  first-subj-bbox / (h,w) / mouth-darkcount")
for name, bb, sz, mc in ys:
    if bb is None:
        print(f"  {name}: (empty)"); continue
    print(f"  {name}: bbox={bb} size={sz} mouth_mc={mc}")

# suggest a steady-speaking window: find contiguous run with mouth_mc above median
mcs = [m for _,_,_,m in ys if m is not None]
if mcs:
    med = np.median(mcs)
    print(f"\n  mouth_mc median={med:.0f} min={min(mcs)} max={max(mcs)}")
    print("  (consistently nonzero => video is a talking face; any 2.5s window ping-pong => seamless 5s loop)")
