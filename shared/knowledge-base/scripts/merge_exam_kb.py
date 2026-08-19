#!/usr/bin/env python3
"""Parse exam question docx into structured txt for Xiaozhi 考 mode."""

from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZONES = ROOT / "zones"
OUT = ROOT / "考题知识库合集.txt"

CHOICE_DOCX = "安安机器人考题-选择题.docx"
JUDGE_DOCX = "安安机器人考题-判断题.docx"

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


@dataclass
class Question:
    qid: str
    qtype: str
    stem: str
    options: list[str]
    answer: str
    analysis: str = ""


def extract_docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    for para in root.findall(".//w:p", NS):
        parts = [node.text for node in para.findall(".//w:t", NS) if node.text]
        if parts:
            text = "".join(parts)
            text = text.replace("\xa0", " ").strip()
            if text:
                lines.append(text)
    return lines


def split_options(body: str) -> tuple[str, list[str]]:
    """Split stem and A/B/C/D options from question body."""
    match = re.search(r"A\.\s*", body)
    if not match:
        return body.strip(), []
    stem = body[: match.start()].strip()
    options_text = body[match.start() :]
    raw = re.findall(r"([A-D])\.\s*(.*?)(?=(?:[A-D]\.)|$)", options_text, flags=re.S)
    options = [f"{letter}. {text.strip()}" for letter, text in raw if text.strip()]
    return stem, options


def parse_choice_line(line: str) -> Question | None:
    match = re.match(
        r"题目(\d+)：\s*(.+?)题目\1答案：\s*([A-D])\s*$",
        line,
        flags=re.S,
    )
    if not match:
        return None
    num, body, answer = match.groups()
    stem, options = split_options(body)
    if not options:
        return None
    return Question(
        qid=f"XZ-{int(num):03d}",
        qtype="选择题",
        stem=stem,
        options=options,
        answer=answer.strip(),
    )


def parse_judge_line(line: str) -> Question | None:
    match = re.match(
        r"题目(\d+)：\s*(.+?)题目\1答案：\s*(正确|错误)(?:（(.+)）)?\s*$",
        line,
        flags=re.S,
    )
    if not match:
        return None
    num, stem, answer, analysis = match.groups()
    return Question(
        qid=f"PD-{int(num):03d}",
        qtype="判断题",
        stem=stem.strip(),
        options=["正确", "错误"],
        answer=answer.strip(),
        analysis=(analysis or "").strip(),
    )


def parse_choice_docx(path: Path) -> list[Question]:
    questions: list[Question] = []
    for line in extract_docx_paragraphs(path):
        q = parse_choice_line(line)
        if q:
            questions.append(q)
    return questions


def parse_judge_docx(path: Path) -> list[Question]:
    questions: list[Question] = []
    for line in extract_docx_paragraphs(path):
        q = parse_judge_line(line)
        if q:
            questions.append(q)
    return questions


def format_question(q: Question) -> str:
    lines = [
        f"【题号】{q.qid}",
        f"【题型】{q.qtype}",
        f"【题干】{q.stem}",
    ]
    if q.qtype == "选择题":
        lines.append("【选项】")
        lines.extend(q.options)
    else:
        lines.append("【选项】正确 / 错误")
    lines.append(f"【标准答案】{q.answer}")
    if q.analysis:
        lines.append(f"【解析】{q.analysis}")
    return "\n".join(lines)


def build() -> str:
    choice_path = ZONES / CHOICE_DOCX
    judge_path = ZONES / JUDGE_DOCX
    if not choice_path.exists():
        raise FileNotFoundError(choice_path)
    if not judge_path.exists():
        raise FileNotFoundError(judge_path)

    choices = parse_choice_docx(choice_path)
    judges = parse_judge_docx(judge_path)
    if len(choices) != 50:
        raise ValueError(f"Expected 50 choice questions, got {len(choices)}")
    if len(judges) != 50:
        raise ValueError(f"Expected 50 judge questions, got {len(judges)}")

    today = date.today().isoformat()
    chunks: list[str] = [
        "# 云安区市场监管综合培训法治教育基地 · 考题知识库（合集）",
        f"# 生成日期：{today}",
        "# 用途：小智机器人「考」模式固定题库（含题干、选项、标准答案）",
        "# 来源：shared/knowledge-base/zones/安安机器人考题-选择题.docx、判断题.docx",
        "# 说明：考模式必须从本题库抽题并按【标准答案】判分，禁止自编题目。",
        "",
        "=" * 72,
        f"# 第 4 部分 · 考 · 选择题题库（共 {len(choices)} 题）",
        f"# 源文件：zones/{CHOICE_DOCX}",
        "# XMind 路径：综合培训区 / 智能机器人 / 考",
        "=" * 72,
        "",
    ]
    for q in choices:
        chunks.extend(["", format_question(q), ""])

    chunks.extend(
        [
            "",
            "=" * 72,
            f"# 第 5 部分 · 考 · 判断题题库（共 {len(judges)} 题）",
            f"# 源文件：zones/{JUDGE_DOCX}",
            "# XMind 路径：综合培训区 / 智能机器人 / 考",
            "=" * 72,
            "",
        ]
    )
    for q in judges:
        chunks.extend(["", format_question(q), ""])

    return "\n".join(chunks).strip() + "\n"


def main() -> None:
    content = build()
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT} ({len(content)} chars, {content.count(chr(10))} lines)")


if __name__ == "__main__":
    main()
