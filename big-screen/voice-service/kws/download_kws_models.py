"""下载 sherpa-onnx KWS 模型（WenetSpeech 3.3M 中文）。"""
from __future__ import annotations

import os
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"
ARCHIVE = MODELS / "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2"
URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/"
    "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2"
)
DIR_NAME = "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01"


def main() -> int:
    MODELS.mkdir(parents=True, exist_ok=True)
    target = MODELS / DIR_NAME
    if target.is_dir() and (target / "tokens.txt").is_file():
        print(f"[download_kws] 模型已存在: {target}")
        return 0

    print(f"[download_kws] 下载 {URL}")
    print("[download_kws] 约 18MB，请稍候…")

    def reporthook(block, block_size, total):
        if total <= 0:
            return
        done = block * block_size
        pct = min(100, done * 100 // total)
        sys.stdout.write(f"\r[download_kws] {pct}%")
        sys.stdout.flush()

    urllib.request.urlretrieve(URL, ARCHIVE, reporthook)
    print("\n[download_kws] 解压…")
    with tarfile.open(ARCHIVE, "r:bz2") as tf:
        tf.extractall(MODELS)
    try:
        ARCHIVE.unlink()
    except OSError:
        pass
    print(f"[download_kws] 完成: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
