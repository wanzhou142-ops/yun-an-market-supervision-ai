#!/usr/bin/env python3
"""Merge zone 法规篇 docx into one txt for Xiaozhi single-file upload."""

from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZONES = ROOT / "zones"
OUT = ROOT / "法规篇知识库合集.txt"

# XMind: 宣传廊 → 三专区 → 法规篇 → 展区知识库
SECTIONS = [
    {
        "zone": "化妆区",
        "law": "《化妆品监督管理条例》",
        "source": "化妆品展区-法规篇.docx",
        "xmind_path": "宣传廊 / 化妆区 / 法规篇 / 展区知识库",
    },
    {
        "zone": "药品区",
        "law": "《中华人民共和国药品管理法》",
        "source": "药品展区-法规篇.docx",
        "xmind_path": "宣传廊 / 药品区 / 法规篇 / 展区知识库",
    },
    {
        "zone": "医疗器械区",
        "law": "《医疗器械监督管理条例》",
        "source": "医疗器械展区-法规篇.docx",
        "xmind_path": "宣传廊 / 医疗器械展区 / 法规篇 / 展区知识库",
    },
]

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def extract_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    for para in root.findall(".//w:p", NS):
        parts = [node.text for node in para.findall(".//w:t", NS) if node.text]
        if parts:
            lines.append("".join(parts))
    return "\n".join(lines)


def normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build() -> str:
    today = date.today().isoformat()
    chunks: list[str] = [
        "# 云安区市场监管综合培训法治教育基地 · 法规篇知识库（合集）",
        f"# 生成日期：{today}",
        "# 用途：小智机器人「问 / 学 / 考」单文件上传（平台仅支持上传一个文档）",
        "# 结构：按 XMind 导图「宣传廊 → 三专区 → 法规篇 → 展区知识库」组织",
        "# 来源：shared/knowledge-base/zones/*-法规篇.docx",
        "# 说明：开发期占位知识库；正式上线前须替换为客户确认的现行有效版本。",
        "",
    ]

    for i, sec in enumerate(SECTIONS, 1):
        src = ZONES / sec["source"]
        if not src.exists():
            raise FileNotFoundError(src)
        body = normalize(extract_docx_text(src))
        chunks.extend(
            [
                "",
                "=" * 72,
                f"# 第 {i} 部分 · {sec['zone']} · 法规篇",
                f"# 对应法规：{sec['law']}",
                f"# XMind 路径：{sec['xmind_path']}",
                f"# 源文件：zones/{sec['source']}",
                "=" * 72,
                "",
                body,
            ]
        )

    chunks.extend(
        [
            "",
            "=" * 72,
            "# 附录 · 综合培训区（智能机器人 · 教 / 学）引用说明",
            "# XMind 路径：综合培训区 / 智能机器人 / 教|学",
            "# 本合集已包含上述三区法规篇 docx，可直接作为教、学模式共用教材。",
            "# 考模式另需：xiaozhi/question-bank/ 考题知识库（不在本合集范围）。",
            "=" * 72,
        ]
    )
    return "\n".join(chunks) + "\n"


def main() -> None:
    content = build()
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT} ({len(content)} chars, {content.count(chr(10))} lines)")


if __name__ == "__main__":
    main()
