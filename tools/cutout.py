import os
from rembg import remove
from PIL import Image
import io

SRC_DIR = r"E:\xiaozhi-Requirement\数字人形象"
OUT_DIR = r"E:\xiaozhi-Requirement\dify-frontend\public"
# 默认用通用显著性去背模型 isnet-general-use（~170MB，对纯白底插画人物抠图干净）
# 如需更高边缘质量可改 RMBG_MODEL=birefnet-general（但模型 ~927MB，下载很慢）
MODEL = os.environ.get("RMBG_MODEL", "isnet-general-use")

FILES = [
    ("welcome.png", "avatar-welcome.png"),
    ("corridor-overview.png", "avatar-corridor.png"),
    ("pharmacy.png", "avatar-pharmacy.png"),
]


def make_session(model):
    try:
        from rembg.session_factory import new_session
        return new_session(model)
    except Exception:
        return None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    session = make_session(MODEL)
    for src_name, out_name in FILES:
        sp = os.path.join(SRC_DIR, src_name)
        with open(sp, "rb") as f:
            data = f.read()
        print(f"[cutout] {src_name} -> model={MODEL}", flush=True)
        if session is not None:
            out = remove(data, session=session)
        else:
            out = remove(data, model_name=MODEL)
        op = os.path.join(OUT_DIR, out_name)
        with open(op, "wb") as f:
            f.write(out)
        im = Image.open(io.BytesIO(out))
        print(f"[cutout] saved {op} size={im.size} mode={im.mode}", flush=True)


if __name__ == "__main__":
    main()
