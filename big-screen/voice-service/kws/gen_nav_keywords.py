"""从 nav_keywords_raw.txt 生成 sherpa-onnx keywords.txt。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models" / "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01"
RAW = ROOT / "nav_keywords_raw.txt"
OUT = ROOT / "nav_keywords.txt"


def main() -> int:
    if not MODEL_DIR.is_dir():
        print("请先运行: python kws/download_kws_models.py")
        return 1
    tokens = MODEL_DIR / "tokens.txt"
    if not tokens.is_file():
        print(f"缺少 {tokens}")
        return 1
    try:
        from sherpa_onnx import text2token
    except ImportError:
        print("请先安装: pip install sherpa-onnx")
        return 1

    texts: list[str] = []
    extras: list[list[str]] = []
    with RAW.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            text_parts: list[str] = []
            extra: list[str] = []
            for p in parts:
                if p.startswith(":") or p.startswith("#") or p.startswith("@"):
                    extra.append(p)
                else:
                    text_parts.append(p)
            texts.append("".join(text_parts) if text_parts else parts[0])
            extras.append(extra)

    encoded = text2token(
        texts,
        tokens=str(tokens),
        tokens_type="ppinyin",
    )
    with OUT.open("w", encoding="utf-8") as f:
        for enc, ex in zip(encoded, extras):
            tokens = enc if isinstance(enc, list) else [enc]
            f.write(" ".join([*tokens, *ex]) + "\n")
    print(f"[gen_nav_keywords] 写入 {OUT} ({len(encoded)} 条)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
