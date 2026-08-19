#!/usr/bin/env python3
"""Merge law KB + exam KB into one txt for Xiaozhi single-file upload."""

from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
OUT = ROOT / "小智问学考知识库合集.txt"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def build_law_content() -> str:
    law_mod = _load_module("merge_law_kb", SCRIPTS / "merge_law_kb.py")
    content = law_mod.build()
    marker = "\n" + "=" * 72 + "\n# 附录"
    idx = content.find(marker)
    if idx != -1:
        content = content[:idx].rstrip() + "\n"
    return content


def build_exam_content() -> str:
    exam_mod = _load_module("merge_exam_kb", SCRIPTS / "merge_exam_kb.py")
    return exam_mod.build()


def _strip_file_header(content: str) -> str:
    """Remove generated file title block; keep from first section divider."""
    divider = "=" * 72
    idx = content.find(divider)
    if idx == -1:
        return content.strip()
    return content[idx:].strip() + "\n"


def build() -> str:
    today = date.today().isoformat()
    law_body = _strip_file_header(build_law_content())
    exam_body = _strip_file_header(build_exam_content())

    header = [
        "# 云安区市场监管综合培训法治教育基地 · 小智问学考知识库（合集）",
        f"# 生成日期：{today}",
        "# 用途：小智平台单文件上传（教 / 学 / 考 共用）",
        "# 结构：",
        "#   第 1–3 部分 · 教 / 学 · 法规篇（化妆区 / 药品区 / 医疗器械区）",
        "#   第 4–5 部分 · 考 · 固定题库（选择题 50 + 判断题 50）",
        "# 维护：python shared/knowledge-base/scripts/merge_xiaozhi_kb.py",
        "",
    ]
    footer = [
        "",
        "=" * 72,
        "# 附录 · 模式分区说明",
        "# 教 / 学：仅使用第 1–3 部分法规篇，禁止引用第 4–5 部分考题库。",
        "# 考：仅从第 4–5 部分考题库抽题，按【标准答案】判分，禁止自编题目。",
        "=" * 72,
        "",
    ]
    return "\n".join(header) + law_body + "\n" + exam_body + "\n".join(footer)


def main() -> None:
    law_mod = _load_module("merge_law_kb", SCRIPTS / "merge_law_kb.py")
    exam_mod = _load_module("merge_exam_kb", SCRIPTS / "merge_exam_kb.py")

    law_mod.main()
    exam_mod.main()

    content = build()
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT} ({len(content)} chars, {content.count(chr(10))} lines)")


if __name__ == "__main__":
    main()
