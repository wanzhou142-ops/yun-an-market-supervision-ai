import numpy as np
from PIL import Image
from pathlib import Path

D = Path(r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-videos/raw")
frames = ["speaking_src_2s.png", "speaking_src_9s.png", "speaking_src_16s.png"]

def analyze(p):
    a = np.asarray(Image.open(p).convert("RGB")).astype(int)
    H, W, _ = a.shape
    # border ring (outer 6%)
    m = int(min(H, W) * 0.06)
    ring = np.concatenate([
        a[:m, :, :].reshape(-1, 3),
        a[-m:, :, :].reshape(-1, 3),
        a[:, :m, :].reshape(-1, 3),
        a[:, -m:, :].reshape(-1, 3),
    ], axis=0)
    mean = ring.mean(axis=0)
    std = ring.std(axis=0)
    # corners
    c = min(25, m * 4)
    corners = []
    for (yy, xx) in [(0, 0), (0, W - c), (H - c, 0), (H - c, W - c)]:
        corners.append(a[yy:yy + c, xx:xx + c].reshape(-1, 3).mean(axis=0))
    corners = np.array(corners)
    R, G, B = mean
    # green-screen heuristic
    green = (G > R + 30) and (G > B + 30) and (G > 120)
    # white/black heuristic
    white = (R > 220 and G > 220 and B > 220)
    black = (R < 35 and G < 35 and B < 35)
    uniform = bool(std.mean() < 25)
    print(f"\n[{p.name}] size={W}x{H}")
    print(f"  border mean RGB = ({R:.0f},{G:.0f},{B:.0f})  std={std.mean():.1f}")
    print(f"  corners RGB = {[tuple(map(int,x)) for x in corners]}")
    print(f"  keyable-solid={uniform}  green-screen={green}  white={white}  black={black}")

for f in frames:
    analyze(D / f)
