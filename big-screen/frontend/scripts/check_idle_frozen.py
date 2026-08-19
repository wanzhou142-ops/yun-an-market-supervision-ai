import subprocess, os, glob
import numpy as np
from PIL import Image

ffmpeg = r"C:/Users/Lenovo/.workbuddy/binaries/python/envs/default/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
mp4 = r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-videos/raw/3D_cartoon_style__female_marke_2026-08-19T07-04-59.mp4"
ref  = r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-videos/raw/3D_cartoon_style__female_marke_2026-08-19T06-00-32.png"
outdir = r"E:/xiaozhi-Requirement/big-screen/frontend/public/avatar-videos/raw/_chk_idle2"
os.makedirs(outdir, exist_ok=True)

r = subprocess.run([ffmpeg, "-y", "-i", mp4, "-vf", "fps=5", os.path.join(outdir, "frame_%03d.png")],
                   capture_output=True, text=True)
if r.returncode != 0:
    print("FFMPEG ERR", r.stderr[-500:]); raise SystemExit

frames = sorted(glob.glob(os.path.join(outdir, "frame_*.png")))
print("frames:", len(frames))
W, H = Image.open(frames[0]).size
print("dims", W, W) if False else print("dims", W, H)


def mouth_metrics(img, H, W):
    """TIGHT mouth box: BELOW eyes (y>0.33H), central face (x 0.40-0.60W).
    Excludes eyes/eyebrows so the metric reflects the mouth, not eye darkness."""
    a = np.asarray(img.convert("RGB")).astype(int)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    ys, xs = np.indices((H, W))
    dark = (R < 110) & (G < 85) & (B < 85)
    fb = (ys > 0.33 * H) & (ys < 0.41 * H) & (xs > 0.40 * W) & (xs < 0.60 * W)
    mb = dark & fb
    mc = int(mb.sum())
    bbox_h = int(ys[mb].max() - ys[mb].min() + 1) if mc > 0 else 0
    return mc, bbox_h


baseline_mc, baseline_h = mouth_metrics(Image.open(ref).resize((W, H), Image.LANCZOS), H, W)
# Open thresholds (any triggers):
mc_th   = baseline_mc * 1.30   # mouth area grew noticeably
h_th    = baseline_h  * 1.40   # vertical extent of mouth cavity grew (closed smile is thin)
abs_h = baseline_h + 12        # absolute: closed smile vertical extent ~baseline; +12px open
print(f"REFERENCE tight-mouth mc = {baseline_mc}, bbox_h = {baseline_h}px")
print(f"OPEN thresholds: mc>{mc_th:.0f}  OR  bbox_h>{h_th:.0f}  OR  bbox_h>{abs_h:.0f}")
print()

print("t(s)\tmc\tbbox_h\tstate")
opens = 0
for i, f in enumerate(frames):
    t = i * 0.2
    mc, bh = mouth_metrics(Image.open(f), H, W)
    is_open = (mc > mc_th) or (bh > h_th) or (bh > abs_h)
    state = "OPEN mouth opened!" if is_open else "ok"
    if is_open:
        opens += 1
    print(f"{t:.1f}\t{mc}\t{bh}\t{state}")

print()
print(f"OPEN frames: {opens} / {len(frames)}")

# Body stillness (re-check)
print()
print("body stillness re-check:")
ys, xs = np.indices((H, W))
leg_tops, bb_bots = [], []
for f in frames:
    a = np.asarray(Image.open(f).convert("RGB")).astype(int)
    G = a[:, :, 1]
    green = (G > 110) & (a[:, :, 0] < 100) & (a[:, :, 2] < 100)
    body = ~green
    lb = (ys > 0.75 * H)
    leg = body & lb
    leg_tops.append(int(ys[leg].min()) if leg.sum() > 0 else 0)
    bb_bots.append(int(ys[body].max()) if body.sum() > 0 else 0)
print(f"legTop range: {min(leg_tops)}..{max(leg_tops)} (constant=static)")
print(f"bb_bot range: {min(bb_bots)}..{max(bb_bots)} (constant=static)")
clean_body = (max(leg_tops) == min(leg_tops)) and (max(bb_bots) == min(bb_bots))
clean_mouth = (opens == 0)
print("VERDICT mouth:", "CLEAN" if clean_mouth else "DIRTY")
print("VERDICT body :", "CLEAN" if clean_body  else "DIRTY")