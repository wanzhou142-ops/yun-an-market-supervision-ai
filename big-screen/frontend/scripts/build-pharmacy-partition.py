#!/usr/bin/env python3
"""Parse pharmacy quiz xlsx and produce area/subArea partition files."""
from __future__ import annotations

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "content" / "video-copy" / "模拟药店问题清单_已嵌图.xlsx"
OUT_DIR = ROOT / "content" / "pharmacy-quiz"

RULES: list[tuple[str, str | None, list[str]]] = [
    ("newretail", None, ["网络", "连锁门店", "配送中心", "信息传输", "数据共享", "智慧药房", "自助售药", "售药柜", "新特药"]),
    ("drug", None, ["药证", "药品经营", "GSP", "执业药师", "药师证", "处方", "非处方", "OTC", "中药", "饮片", "阴凉", "温湿度", "冷藏", "疫苗", "港产药品", "港版", "生物制品", "近效期", "拆零", "药品超过", "药品变质", "零售药店禁止经营", "必须凭处方", "药学技术", "质量负责人", "药品广告", "按药品说明书"]),
    ("nondrug", "device", ["医疗器械", "三类证", "二类", "三类", "一类", "入系统"]),
    ("nondrug", "food", ["食品", "保健", "奶粉", "陈皮", "削瓜器", "纸尿片", "散装食品", "特殊食品", "食品安全", "健康食品", "港版奶粉"]),
    ("nondrug", "cosmetic", ["化妆品", "中文标签", "供货企业档案", "进货查验记录", "产品销售记录", "质量安全管理制度"]),
    ("nondrug", "price", ["明码标价", "价格欺诈", "折价", "解释权"]),
    ("nondrug", "ad", ["广告批文", "抽奖", "有奖销售", "附赠式"]),
]

GENERAL_KW = [
    "营业执照", "公示栏", "监督电话", "意见簿", "培训记录", "健康证明",
    "健康管理制度", "从业人员", "质量管理人员", "营业场所外", "三无产品",
    "假冒专利", "专利标识", "注册商标", "新会陈皮",
]

SUB_LABELS = {
    "food": "食品保健食品区",
    "device": "医疗器械区",
    "cosmetic": "化妆品区",
    "other": "其他产品区",
    "price": "价格类",
    "ad": "广告/促销类",
    "_none": "（无细分类）",
}


def read_xlsx(path: Path) -> dict[str, list[dict[str, str]]]:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as z:
        shared = ET.fromstring(z.read("xl/sharedStrings.xml"))
        strings: list[str] = []
        for si in shared.findall("m:si", ns):
            parts = [
                t.text or ""
                for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
            ]
            strings.append("".join(parts))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid_map = {
            r.get("Id"): r.get("Target")
            for r in rels.findall("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship")
        }
        sheets: dict[str, list[dict[str, str]]] = {}
        for s in wb.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet"):
            name = s.get("name") or ""
            rid = s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = "xl/" + rid_map[rid].lstrip("/")
            sheet = ET.fromstring(z.read(target))
            rows: list[dict[str, str]] = []
            for row in sheet.findall(".//m:row", ns):
                cells: dict[str, str] = {}
                for c in row.findall("m:c", ns):
                    ref = c.get("r", "")
                    col = "".join(ch for ch in ref if ch.isalpha())
                    t = c.get("t")
                    v = c.find("m:v", ns)
                    if v is None:
                        val = ""
                    elif t == "s":
                        val = strings[int(v.text)]
                    else:
                        val = v.text or ""
                    cells[col] = val
                if cells:
                    rows.append(cells)
            sheets[name] = rows
        return sheets


def classify(text: str) -> tuple[str, str | None, list[str]]:
    hits: list[tuple[str, str | None, list[str]]] = []
    for area, sub, kws in RULES:
        matched = [k for k in kws if k in text]
        if matched:
            hits.append((area, sub, matched))

    if not hits:
        if any(k in text for k in GENERAL_KW):
            return "nondrug", "other", ["general-default"]
        return "nondrug", "other", ["unmatched-default"]

    for area, sub, matched in hits:
        if area == "newretail":
            return area, sub, matched

    nondrug_hits = [h for h in hits if h[0] == "nondrug" and h[1]]
    if nondrug_hits:
        best = max(nondrug_hits, key=lambda h: max(len(m) for m in h[2]))
        return best[0], best[1], best[2]

    drug_hits = [h for h in hits if h[0] == "drug"]
    if drug_hits:
        best = max(drug_hits, key=lambda h: max(len(m) for m in h[2]))
        return best[0], best[1], best[2]

    return "nondrug", "other", ["fallback"]


def main() -> None:
    sheets = read_xlsx(XLSX)
    problems: list[dict] = []
    for r in sheets["问题清单"]:
        if not r.get("A", "").isdigit():
            continue
        pid = int(r["A"])
        text = r.get("B", "")
        imgs = re.findall(r"IMG_\d+\.jpg", r.get("D", ""))
        has_embed = "DISPIMG" in r.get("C", "")
        area, sub, matched = classify(text)
        problems.append({
            "id": pid,
            "text": text,
            "images": imgs,
            "hasImage": bool(imgs or has_embed),
            "area": area,
            "subArea": sub,
            "matchedKeywords": matched,
        })

    by_area: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    for pr in problems:
        sub = pr["subArea"] or "_none"
        by_area[pr["area"]][sub].append(pr["id"])

    summary = {
        "version": 1,
        "generatedAt": date.today().isoformat(),
        "source": str(XLSX.relative_to(ROOT)).replace("\\", "/"),
        "rules": {
            "mixedGeneralDefault": "nondrug / other",
            "quizRoundSize": 3,
            "skipNoImage": True,
        },
        "counts": {
            "total": len(problems),
            "withImage": sum(1 for p in problems if p["hasImage"]),
            "noImage": sum(1 for p in problems if not p["hasImage"]),
        },
        "byArea": {},
        "problems": {
            str(p["id"]): {
                "area": p["area"],
                "subArea": p["subArea"],
                "hasImage": p["hasImage"],
                "images": p["images"],
                "text": p["text"],
                "matchedKeywords": p["matchedKeywords"],
            }
            for p in problems
        },
    }

    for area in ("drug", "nondrug", "newretail"):
        subs = by_area.get(area, {})
        summary["byArea"][area] = {
            "total": sum(len(v) for v in subs.values()),
            "withImage": sum(1 for p in problems if p["area"] == area and p["hasImage"]),
            "subAreas": {
                k: {"ids": sorted(v), "count": len(v)}
                for k, v in sorted(subs.items())
            },
        }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "partition.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    csv_lines = ["problemId,area,subArea,hasImage,images,text,matchedKeywords,notes"]
    for p in sorted(problems, key=lambda x: x["id"]):
        imgs = "|".join(p["images"])
        kws = "|".join(p["matchedKeywords"])
        text = p["text"].replace(",", "，")
        csv_lines.append(
            f"{p['id']},{p['area']},{p['subArea'] or ''},{p['hasImage']},{imgs},{text},{kws},"
        )
    (OUT_DIR / "partition-review.csv").write_text("\n".join(csv_lines), encoding="utf-8-sig")

    md: list[str] = [
        "# 模拟药店问题分区结果（题号索引）",
        "",
        "> 源文件：`content/video-copy/模拟药店问题清单_已嵌图.xlsx`",
        "> 机器可读：`partition.json` · 可编辑：`partition-review.csv`",
        "> 规则：难以划分 / 通用题 → **非药品区 / 其他产品区（other）**",
        "",
        "## 统计",
        "",
        f"- 总题数：**{len(problems)}**（有图 {summary['counts']['withImage']}，无图 {summary['counts']['noImage']}）",
        "- 每区随机出题：**3 题**",
        "",
    ]

    area_labels = {"drug": "药品区", "nondrug": "非药品区", "newretail": "新零售模式区"}
    for area, label in area_labels.items():
        a = summary["byArea"][area]
        md.append(f"## {label}（`{area}`）— {a['total']} 题，有图 {a['withImage']} 题")
        md.append("")
        for sub, data in a["subAreas"].items():
            md.append(f"### {SUB_LABELS.get(sub, sub)}（`{sub}`）— {data['count']} 题")
            md.append("")
            md.append("题号：" + "、".join(str(i) for i in data["ids"]))
            md.append("")

    other_ids = summary["byArea"]["nondrug"]["subAreas"].get("other", {}).get("ids", [])
    md.extend([
        "## 其他产品区（other）— 便于后续挪移",
        "",
        "改法：编辑 `partition-review.csv` 的 `subArea` 列（如改为 `food` / `device` / `cosmetic`），再跑本脚本或手动改 `partition.json`。",
        "",
        "```",
        "、".join(str(i) for i in other_ids),
        "```",
        "",
        "| 题号 | 有图 | 题干 | 命中关键词 |",
        "|------|------|------|------------|",
    ])
    for pid in other_ids:
        pr = summary["problems"][str(pid)]
        img = "是" if pr["hasImage"] else "否"
        kws = "、".join(pr["matchedKeywords"])
        text = pr["text"].replace("|", "｜")
        md.append(f"| {pid} | {img} | {text} | {kws} |")

    no_img = [p["id"] for p in problems if not p["hasImage"]]
    md.extend([
        "",
        "## 无图题（本期跳过）",
        "",
        "题号：" + "、".join(str(i) for i in no_img),
        "",
    ])
    (OUT_DIR / "partition-summary.md").write_text("\n".join(md), encoding="utf-8")

    print(f"Wrote {OUT_DIR}")
    for area in ("drug", "nondrug", "newretail"):
        a = summary["byArea"][area]
        subs = {k: v["count"] for k, v in a["subAreas"].items()}
        print(f"  {area}: total={a['total']} withImage={a['withImage']} subs={subs}")


if __name__ == "__main__":
    main()
