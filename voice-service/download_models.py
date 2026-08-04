#!/usr/bin/env python3
"""
离线语音模型一次性下载脚本。
在你（能出外网）的电脑上跑一次，把 Vosk + Piper 模型下好，
之后连同 models/ 目录一起打包给客户机即可零联网运行。

Windows:  双击 download_models.bat
Git Bash: bash download_models.sh
"""
import os
import sys
import json
import urllib.request
import zipfile
import shutil
import subprocess
from pathlib import Path

# 默认使用 WorkBuddy managed venv；找不到就创建
MANAGED_PYTHON = Path(r"C:\Users\Lenovo\.workbuddy\binaries\python\versions\3.13.12\python.exe")
VENV_DIR = Path(r"C:\Users\Lenovo\.workbuddy\binaries\python\envs\default")

ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
VOSK_ZIP_URL = "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
VOSK_ZIP_FILE = MODELS_DIR / "vosk-model-small-cn-0.22.zip"
VOSK_MODEL_DIR = MODELS_DIR / "vosk-model-small-cn-0.22"

# HuggingFace 镜像：如果访问慢，可设环境变量 HF_ENDPOINT=https://hf-mirror.com
HF_HOST = (os.environ.get("HF_ENDPOINT") or "https://huggingface.co").rstrip("/")
PIPER_BASE = f"{HF_HOST}/rhasspy/piper-voices/resolve/v1.0.0/zh/zh_CN/huayan/medium/"
PIPER_FILES = [
    "zh_CN-huayan-medium.onnx",
    "zh_CN-huayan-medium.onnx.json",
]
PIPER_DIR = MODELS_DIR / "piper"


def ensure_venv():
    """确保 venv 存在，并且已安装 vosk / piper-tts / edge-tts。"""
    pip = VENV_DIR / ("Scripts" if sys.platform == "win32" else "bin") / "pip"
    python = VENV_DIR / ("Scripts" if sys.platform == "win32" else "bin") / "python"

    if not VENV_DIR.exists():
        print(f"[setup] 创建 venv: {VENV_DIR}")
        subprocess.run([str(MANAGED_PYTHON), "-m", "venv", str(VENV_DIR)], check=True)
    else:
        print(f"[setup] venv 已存在: {VENV_DIR}")

    print("[setup] 安装依赖 vosk / piper-tts / edge-tts ...")
    # 只安装目标包，不主动升级 pip，避免 Windows 上升级 pip 的权限提示吓到用户
    subprocess.run(
        [str(pip), "install", "vosk", "piper-tts", "edge-tts"],
        check=True,
    )
    print("[setup] 依赖安装完成")
    return python


def download(url: str, dest: Path):
    if dest.exists():
        print(f"[skip] {dest.name} 已存在")
        return
    # HuggingFace 大文件建议带 ?download=true
    if "huggingface.co" in url and "?download=true" not in url:
        url = url + "?download=true"
    print(f"[download] {url} -> {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as f:
        shutil.copyfileobj(resp, f)
    print(f"[done] {dest.name}")


def download_vosk():
    MODELS_DIR.mkdir(exist_ok=True)
    download(VOSK_ZIP_URL, VOSK_ZIP_FILE)
    if VOSK_MODEL_DIR.exists():
        print("[skip] Vosk 模型已解压")
    else:
        print("[extract] 解压 Vosk 模型...")
        with zipfile.ZipFile(VOSK_ZIP_FILE, "r") as z:
            z.extractall(MODELS_DIR)
        print("[done]")
    VOSK_ZIP_FILE.unlink(missing_ok=True)


def download_piper():
    PIPER_DIR.mkdir(parents=True, exist_ok=True)
    for fname in PIPER_FILES:
        url = PIPER_BASE + fname
        dest = PIPER_DIR / fname
        download(url, dest)
    # PiperVoice.load(model.onnx, model.onnx.json) 默认找同名 .json
    # 有些版本找 .json，这里复制一份别名避免兼容问题
    json_file = PIPER_DIR / "zh_CN-huayan-medium.onnx.json"
    alt_json = PIPER_DIR / "zh_CN-huayan-medium.json"
    if json_file.exists() and not alt_json.exists():
        shutil.copyfile(json_file, alt_json)
    print("[done] Piper 模型准备完成")


def main():
    print("=" * 60)
    print(" 离线语音模型下载")
    print("=" * 60)
    print(f" models 目录: {MODELS_DIR}")
    print(f" venv 目录:   {VENV_DIR}")
    print()

    # 如网络走代理，取消下面注释
    # os.environ.setdefault("HTTPS_PROXY", "http://127.0.0.1:7890")

    python = ensure_venv()
    download_vosk()
    download_piper()

    print()
    print("=" * 60)
    print(" 全部完成。请检查以下文件/目录：")
    print(f"  - {VOSK_MODEL_DIR}")
    print(f"  - {PIPER_DIR}")
    print("=" * 60)
    print()
    print("现在可以运行 start.bat / start.sh 启动语音服务。")


if __name__ == "__main__":
    main()
