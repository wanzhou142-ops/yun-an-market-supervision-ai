import subprocess, os, glob
import numpy as np
from PIL import Image

ffmpeg = r"C:/Users/Lenovo/.workbuddy/binaries/python/envs/default/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
mp4 = r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-videos/raw/3D_cartoon_style__female_marke_2026-08-19T06-11-45.mp4"
outdir = r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-videos/raw/_chk_idle"
os.makedirs(outdir, exist_ok=True)

# extract 5 fps (every 0.2s)
r = subprocess.run([ffmpeg, "-y", "-i", mp4, "-vf", "fps=5", os.path.join(outdir, "frame_%03d.png")],
                   capture_output=True, text=True)
if r.returncode != 0:
    print("FFMPEG ERR", r.stderr[-500:])
    raise SystemExit

frames = sorted(glob.glob(os.path.join(outdir, "frame_*.png")))
print("frames:", len(frames))
im0 = Image.open(frames[0]).convert("RGB")
W, H = im0.size
print("dims", W, H)


def metrics(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    ys, xs = np.indices((H, W))
    # green screen mask
    green = (G > 110) & (R < 100) & (B < 100)
    body = ~green
    # mouth-dark (oral cavity: dark reddish), restricted to lower-face band
    mouth = (R < 110) & (G < 85) & (B < 85)
    fb = (ys > 0.25 * H) & (ys < 0.42 * H) & (xs > 0.33 * W) & (xs < 0.67 * W)
    mb = mouth & fb
    mc = int(mb.sum())
    if mc > 0:
        aspect = (ys[mb].max() - ys[mb].min() + 1) / max(xs[mb].max() - xs[mb].min() + 1, 1)
        ratio = mc / max(fb.sum(), 1)
    else:
        aspect, ratio = 0.0, 0.0
    # silhouette bbox (catch body motion / leg movement)
    if body.sum() > 0:
        bb_top = int(ys[body].min())
        bb_bot = int(ys[body].max())
        bb_h = bb_bot - bb_top + 1
    else:
        bb_top = bb_bot = bb_h = 0
    # leg band (bottom 25%): count + top edge (should be constant if still)
    lb = (ys > 0.75 * H)
    leg = body & lb
    leg_cnt = int(leg.sum())
    leg_top = int(ys[leg].min()) if leg_cnt > 0 else 0
    return dict(mc=mc, aspect=round(float(aspect), 2), ratio=round(float(ratio), 4),
                bb_top=bb_top, bb_bot=bb_bot, bb_h=bb_h, leg_cnt=leg_cnt, leg_top=leg_top)


print("t(s)\tmc\taspect\tratio\tbb_top\tbb_bot\tbb_h\tlegCnt\tlegTop")
for i, f in enumerate(frames):
    t = i * 0.2
    m = metrics(f)
    print(f"{t:.1f}\t{m['mc']}\t{m['aspect']}\t{m['ratio']}\t{m['bb_top']}\t{m['bb_bot']}\t{m['bb_h']}\t{m['leg_cnt']}\t{m['leg_top']}")
