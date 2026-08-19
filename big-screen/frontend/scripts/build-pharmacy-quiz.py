#!/usr/bin/env python3
"""Build pharmacy quiz pairs + export images to public/."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore[misc, assignment]

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "content" / "video-copy" / "模拟药店问题清单_已嵌图.xlsx"
PARTITION = ROOT / "content" / "pharmacy-quiz" / "partition.json"
OUT_DIR = ROOT / "frontend" / "public" / "pharmacy-quiz"
QUIZ_ROUND_SIZE = 3
TRIM_FUZZ = "8%"
EDGE_STRIP_PX = 4
EDGE_WHITE_RATIO = 0.88
EDGE_WHITE_MIN = 245

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
T_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"

STOP_WORDS = frozenset(list(
    "\u7684\u4e0d\u65e0\u672a\u6ca1\u6709\u548c\u4e0e\u53ca\u5728\u662f\u4e3a\u6709\u8fd9\u90a3\u4e2a\u4e86\u5417\u5462\u5427\u554a"
))


def read_strings(z: zipfile.ZipFile) -> list[str]:
    shared = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for si in shared.findall("m:si", NS):
        parts = [t.text or "" for t in si.iter(T_NS)]
        strings.append("".join(parts))
    return strings


def read_sheet_rows(z: zipfile.ZipFile, sheet_path: str, strings: list[str]) -> list[dict[str, str]]:
    sheet = ET.fromstring(z.read(sheet_path))
    rows: list[dict[str, str]] = []
    for row in sheet.findall(".//m:row", NS):
        cells: dict[str, str] = {}
        for c in row.findall("m:c", NS):
            ref = c.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            t = c.get("t")
            v = c.find("m:v", NS)
            if v is None:
                val = ""
            elif t == "s":
                val = strings[int(v.text)]
            else:
                val = v.text or ""
            cells[col] = val
        if cells:
            rows.append(cells)
    return rows


def map_problem_images(z: zipfile.ZipFile) -> dict[int, str]:
    """Map problem id -> xl/media/... using 问题清单 row order + drawing1 embeds (full-res)."""
    strings = read_strings(z)
    rows = read_sheet_rows(z, "xl/worksheets/sheet1.xml", strings)

    rels = ET.fromstring(z.read("xl/drawings/_rels/drawing1.xml.rels"))
    rid_to_media: dict[str, str] = {}
    for r in rels.findall(REL_NS):
        rid_to_media[r.get("Id") or ""] = (r.get("Target") or "").replace("../", "")

    embeds = re.findall(r'r:embed="(rId\d+)"', z.read("xl/drawings/drawing1.xml").decode("utf-8"))

    mapping: dict[int, str] = {}
    embed_i = 0
    for row in rows:
        pid = row.get("A", "")
        if not pid.isdigit():
            continue
        if not re.search(r"IMG_\d+\.jpg", row.get("D", "")):
            continue
        if embed_i >= len(embeds):
            break
        media = rid_to_media.get(embeds[embed_i], "")
        if media:
            mapping[int(pid)] = media
        embed_i += 1
    return mapping


def map_index_images(z: zipfile.ZipFile) -> dict[str, str]:
    """Legacy thumbnail map from 图片索引 — kept for imageMap metadata only."""
    rels = ET.fromstring(z.read("xl/drawings/_rels/drawing2.xml.rels"))
    rid_to_media: dict[str, str] = {}
    for r in rels.findall(REL_NS):
        rid_to_media[r.get("Id") or ""] = (r.get("Target") or "").replace("../", "")

    d2 = z.read("xl/drawings/drawing2.xml").decode("utf-8")
    embeds = re.findall(r'r:embed="(rId\d+)"', d2)

    strings = read_strings(z)
    rows = read_sheet_rows(z, "xl/worksheets/sheet2.xml", strings)
    fnames = [r["A"] for r in rows if r.get("A") and r["A"] != "图片文件"]

    mapping: dict[str, str] = {}
    for fname, rid in zip(fnames, embeds):
        media = rid_to_media.get(rid, "")
        if media:
            mapping[fname] = media
    return mapping


def extract_keywords(text: str) -> list[str]:
    kws: set[str] = set()
    for m in re.finditer(r"[\u4e00-\u9fff《》（）]{2,}", text):
        phrase = m.group(0).strip("《》（）")
        if len(phrase) >= 2 and phrase not in STOP_WORDS:
            kws.add(phrase)
    for token in ["许可证", "药证", "处方", "过期", "备案", "医疗器械", "化妆品", "食品", "培训", "健康", "营业执照", "标价", "广告"]:
        if token in text:
            kws.add(token)
    return sorted(kws, key=len, reverse=True)[:12]


def resolve_magick() -> str | None:
    for name in ("magick", "magick.exe"):
        path = shutil.which(name)
        if path:
            return path
    env_home = os.environ.get("MAGICK_HOME")
    if env_home:
        candidate = Path(env_home) / "magick.exe"
        if candidate.is_file():
            return str(candidate)
    for base in (Path(r"C:\Program Files"), Path(r"C:\Program Files (x86)")):
        if not base.is_dir():
            continue
        for folder in sorted(base.glob("ImageMagick*"), reverse=True):
            candidate = folder / "magick.exe"
            if candidate.is_file():
                return str(candidate)
    return None


def trim_near_white_border_pil(im: "Image.Image", row_ratio: float = 0.92, margin: int = 245) -> "Image.Image":
    """Fallback crop when ImageMagick is unavailable."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()

    def col_border(x: int) -> bool:
        bright = sum(1 for y in range(h) if sum(px[x, y]) >= margin * 3)
        return bright >= h * row_ratio

    def row_border(y: int) -> bool:
        bright = sum(1 for x in range(w) if sum(px[x, y]) >= margin * 3)
        return bright >= w * row_ratio

    left, right = 0, w
    top, bottom = 0, h
    while left < right - 8 and col_border(left):
        left += 1
    while right > left + 8 and col_border(right - 1):
        right -= 1
    while top < bottom - 8 and row_border(top):
        top += 1
    while bottom > top + 8 and row_border(bottom - 1):
        bottom -= 1
    if right - left < w // 3 or bottom - top < h // 3:
        return im
    return rgb.crop((left, top, right, bottom))


def trim_with_magick(raw: bytes, dest: Path, magick: str) -> None:
    suffix = dest.suffix if dest.suffix else ".jpeg"
    with tempfile.TemporaryDirectory(prefix="quiz-trim-") as tmp:
        src = Path(tmp) / f"in{suffix}"
        out = Path(tmp) / f"out{suffix}"
        src.write_bytes(raw)
        cmd = [magick, str(src), "-fuzz", TRIM_FUZZ, "-trim", "+repage"]
        if suffix.lower() in (".jpg", ".jpeg"):
            cmd.extend(["-quality", "92"])
        cmd.append(str(out))
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "magick trim failed")
        shutil.copy2(out, dest)


def save_quiz_image(raw: bytes, dest: Path, magick: str | None) -> str:
    """Trim and save; returns trim method label."""
    if magick:
        try:
            trim_with_magick(raw, dest, magick)
            return "magick"
        except (OSError, RuntimeError) as err:
            print(f"  WARN magick trim failed for {dest.name}: {err}; falling back to PIL")

    if Image is None:
        dest.write_bytes(raw)
        return "raw"

    im = Image.open(BytesIO(raw))
    trimmed = trim_near_white_border_pil(im)
    if dest.suffix.lower() in (".jpg", ".jpeg"):
        trimmed.save(dest, format="JPEG", quality=92, optimize=True)
    elif dest.suffix.lower() == ".png":
        trimmed.save(dest, format="PNG", optimize=True)
    else:
        trimmed.save(dest)
    return "pil"


def _edge_is_mostly_white(px, w: int, h: int, edge: str, strip: int) -> bool:
    bright = 0
    total = 0
    if edge == "top":
        for y in range(min(strip, h)):
            for x in range(w):
                total += 1
                if min(px[x, y]) >= EDGE_WHITE_MIN:
                    bright += 1
    elif edge == "bottom":
        for y in range(max(0, h - strip), h):
            for x in range(w):
                total += 1
                if min(px[x, y]) >= EDGE_WHITE_MIN:
                    bright += 1
    elif edge == "left":
        for x in range(min(strip, w)):
            for y in range(h):
                total += 1
                if min(px[x, y]) >= EDGE_WHITE_MIN:
                    bright += 1
    elif edge == "right":
        for x in range(max(0, w - strip), w):
            for y in range(h):
                total += 1
                if min(px[x, y]) >= EDGE_WHITE_MIN:
                    bright += 1
    return total > 0 and bright / total >= EDGE_WHITE_RATIO


def check_white_border(path: Path) -> list[str]:
    """Return edge names that still look like near-white borders."""
    if Image is None or not path.is_file():
        return []
    im = Image.open(path).convert("RGB")
    w, h = im.size
    if w < 16 or h < 16:
        return []
    px = im.load()
    failed: list[str] = []
    for edge in ("top", "bottom", "left", "right"):
        if _edge_is_mostly_white(px, w, h, edge, EDGE_STRIP_PX):
            failed.append(edge)
    return failed


def validate_exported_images(paths: list[Path]) -> dict[str, list[str]]:
    issues: dict[str, list[str]] = {}
    for path in sorted(set(paths)):
        edges = check_white_border(path)
        if edges:
            issues[path.name] = edges
    return issues


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pharmacy quiz pairs and export trimmed images.")
    parser.add_argument(
        "--magick",
        help="Path to magick.exe if not on PATH (e.g. C:\\Program Files\\ImageMagick-7.x\\magick.exe)",
    )
    args = parser.parse_args()

    partition = json.loads(PARTITION.read_text(encoding="utf-8"))
    img_dir = OUT_DIR / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    magick = args.magick or resolve_magick()
    if magick and not Path(magick).is_file():
        print(f"WARN: --magick path not found: {magick}")
        magick = None
    if magick:
        print(f"Trim: ImageMagick ({magick}) fuzz={TRIM_FUZZ}")
    else:
        print("Trim: ImageMagick not found, using PIL fallback")
        print("  Tip: install ImageMagick and reopen terminal, or pass --magick \"C:\\\\Program Files\\\\ImageMagick-7.x\\\\magick.exe\"")

    with zipfile.ZipFile(XLSX) as z:
        problem_media = map_problem_images(z)
        thumb_map = map_index_images(z)

    exported_media: dict[str, str] = {}
    exported_fname: dict[str, str] = {}
    exported_paths: list[Path] = []
    trim_methods: dict[str, int] = {}

    def export_media(z: zipfile.ZipFile, media_path: str) -> str:
        if media_path in exported_media:
            return exported_media[media_path]
        src = f"xl/{media_path}"
        dest_name = Path(media_path).name
        dest = img_dir / dest_name
        method = save_quiz_image(z.read(src), dest, magick)
        trim_methods[method] = trim_methods.get(method, 0) + 1
        exported_paths.append(dest)
        url = f"/pharmacy-quiz/images/{dest.name}"
        exported_media[media_path] = url
        return url

    with zipfile.ZipFile(XLSX) as z:
        for fname, media_path in thumb_map.items():
            exported_fname[fname] = export_media(z, media_path)

    pairs: list[dict] = []
    areas: dict[str, list[int]] = {"drug": [], "nondrug": [], "newretail": []}

    with zipfile.ZipFile(XLSX) as z:
        for pid_str, meta in partition["problems"].items():
            pid = int(pid_str)
            if not meta.get("hasImage"):
                continue
            media = problem_media.get(pid)
            if not media:
                continue
            imgs = meta.get("images") or []
            primary = imgs[0] if imgs else ""
            area = meta["area"]
            image_url = export_media(z, media)
            pair = {
                "id": pid,
                "area": area,
                "subArea": meta.get("subArea"),
                "image": primary,
                "imageUrl": image_url,
                "answer": meta["text"],
                "keywords": extract_keywords(meta["text"]),
            }
            pairs.append(pair)
            if area in areas:
                areas[area].append(pid)

    manifest = {
        "version": 1,
        "quizRoundSize": QUIZ_ROUND_SIZE,
        "pairCount": len(pairs),
        "areas": {
            k: {"pairIds": sorted(v), "count": len(v)}
            for k, v in areas.items()
        },
        "imageMap": exported_fname,
        "pairs": pairs,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "pairs.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copy2(PARTITION, OUT_DIR / "partition.json")

    print(f"Exported {len(exported_media)} full-res images, {len(pairs)} pairs -> {OUT_DIR}")
    for method, count in sorted(trim_methods.items()):
        print(f"  trim via {method}: {count}")

    border_issues = validate_exported_images(exported_paths)
    report_path = OUT_DIR / "trim-report.json"
    report = {
        "trimFuzz": TRIM_FUZZ,
        "magick": magick,
        "edgeStripPx": EDGE_STRIP_PX,
        "edgeWhiteRatio": EDGE_WHITE_RATIO,
        "exportedCount": len(exported_paths),
        "passCount": len(exported_paths) - len(border_issues),
        "failCount": len(border_issues),
        "failures": border_issues,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if border_issues:
        print(f"Trim QA: {len(border_issues)} image(s) still have near-white edges -> {report_path}")
        for name, edges in list(border_issues.items())[:12]:
            print(f"  FAIL {name}: {', '.join(edges)}")
        if len(border_issues) > 12:
            print(f"  ... and {len(border_issues) - 12} more (see trim-report.json)")
    else:
        print(f"Trim QA: all {len(exported_paths)} images passed edge check -> {report_path}")

    for area, ids in areas.items():
        print(f"  {area}: {len(ids)} pairs")


if __name__ == "__main__":
    main()
