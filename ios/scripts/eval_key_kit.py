#!/usr/bin/env python3
"""The answer-key kit for the iPhone report-reading eval (docs/evidence/eval/README.md).

A person writes the key, before any model run. This script only helps with the form, and never writes a report or an
answer itself:

  template   writes the blank fill-in sheet, docs/evidence/eval/KEY-TEMPLATE.csv (20 empty rows).
  picture    draws the piedmont-park-dev grid with its segment ids and feature classes, for labelling without the app
             (docs/evidence/eval/piedmont-park-dev-grid.svg, and .png when rsvg-convert is installed).
  convert    turns a filled sheet into docs/evidence/eval/pls-drill-reports-v1.json, taking each value exactly as
             written, and prints the file's SHA-256 to pin in EvalKeyPinTests. It refuses to replace a key that exists:
             a key is never edited after a run; a changed key gets a new name.

Standard library only. Run from the repository root.
"""

import argparse
import csv
import hashlib
import io
import json
import math
import os
import shutil
import subprocess
import sys

KEY_NAME = "pls-drill-reports-v1"
GRID_ID = "piedmont-park-dev"
GRID_FILE = os.path.join("shared", "grid", GRID_ID + ".grid.json")
EVAL_DIR = os.path.join("docs", "evidence", "eval")
TEMPLATE = os.path.join(EVAL_DIR, "KEY-TEMPLATE.csv")
KEY_FILE = os.path.join(EVAL_DIR, KEY_NAME + ".json")
PICTURE = os.path.join(EVAL_DIR, GRID_ID + "-grid.svg")
ROWS = 20
COLUMNS = ["report_text", "expected_kind", "segment_ids", "place_feature"]
# ReportKind and Feature in ios/PLSCore/Sources/PLSCore/ReportReading.swift, the values the eval scores.
KINDS = ["cleared", "sighting", "clue", "found", "unclear"]
FEATURES = ["creek_or_drainage", "water", "road", "trail", "structure", "brush", "woods", "field", "other", "none"]
MAX_SEGMENTS = 2


def grid_segments():
    with open(GRID_FILE, encoding="utf-8") as f:
        return json.load(f)["segments"]


def segment_ids():
    return [s["segmentId"] for s in grid_segments()]


def id_ranges(ids):
    """The ids as letter ranges, AA to AZ, ..., for the sheet's header."""
    groups = {}
    for i in ids:
        groups.setdefault(i[0], []).append(i)
    return ", ".join(f"{g[0]} to {g[-1]}" if len(g) > 1 else g[0] for g in groups.values())


def template_text():
    ids = segment_ids()
    head = [
        f"# Answer key for the iPhone report-reading eval: {KEY_NAME}, on the {GRID_ID} grid.",
        "# Write every answer yourself, before any model run. Do not run the app on these reports first.",
        "# One row per short drill report a searcher might give. Made-up drill content only: no real person, place or",
        "# health detail. The grid picture beside this sheet shows the segment ids and feature classes.",
        "# report_text: the words; put them in double quotes if they hold a comma.",
        f"# expected_kind: one of {', '.join(KINDS)}.",
        f"# segment_ids: 0 to {MAX_SEGMENTS} segment ids separated by a space ({id_ranges(ids)}); leave it empty when the",
        "#   report names no segment.",
        f"# place_feature: one of {', '.join(FEATURES)}.",
        "# Lines starting with # are ignored. When it is filled:",
        "#   python3 ios/scripts/eval_key_kit.py convert docs/evidence/eval/KEY-TEMPLATE.csv",
    ]
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(COLUMNS)
    for _ in range(ROWS):
        w.writerow([""] * len(COLUMNS))
    return "\n".join(head) + "\n" + buf.getvalue()


# --- picture ---------------------------------------------------------------------------------------------------------

def ring_contains(ring, x, y):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polygon_contains(rings, x, y):
    return ring_contains(rings[0], x, y) and not any(ring_contains(h, x, y) for h in rings[1:])


def label_point(rings, centroid):
    """The centroid when it lies inside the segment; otherwise the middle of the widest stretch of the segment along
    one of 15 lines of latitude (holes count), so every label sits inside its segment."""
    cx, cy = centroid["lon"], centroid["lat"]
    if polygon_contains(rings, cx, cy):
        return cx, cy
    ys = [p[1] for p in rings[0]]
    best = None
    for k in range(1, 16):
        y = min(ys) + (max(ys) - min(ys)) * k / 16
        xs = []
        for ring in rings:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                if (y1 > y) != (y2 > y):
                    xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            if best is None or b - a > best[0]:
                best = (b - a, (a + b) / 2, y)
    return (best[1], best[2]) if best else (cx, cy)


def picture_svg():
    segments = grid_segments()
    lons = [p[0] for s in segments for p in s["geometry"]["coordinates"][0]]
    lats = [p[1] for s in segments for p in s["geometry"]["coordinates"][0]]
    k = math.cos(math.radians((min(lats) + max(lats)) / 2))
    width = 1200
    scale = (width - 80) / ((max(lons) - min(lons)) * k)
    height = int((max(lats) - min(lats)) * scale) + 230

    def xy(lon, lat):
        return 40 + (lon - min(lons)) * k * scale, 90 + (max(lats) - lat) * scale

    fill = {"water": "#9ecae1", "stream": "#c6dbef"}
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
           f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
           f'<text x="40" y="50" font-family="Helvetica" font-size="30" font-weight="bold">{GRID_ID}: segment ids</text>',
           '<text x="40" y="78" font-family="Helvetica" font-size="18">'
           'Feature classes from the grid file. Every segment has a trail. Names of places are not in the file.</text>']
    for s in segments:
        rings = s["geometry"]["coordinates"]
        classes = set(s["featureClasses"])
        color = fill["water"] if "water" in classes else fill["stream"] if "stream" in classes else "#f0f0f0"
        d = " ".join("M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in (xy(*p) for p in ring)) + " Z" for ring in rings)
        out.append(f'<path d="{d}" fill="{color}" stroke="#555555" stroke-width="1.5" fill-rule="evenodd"/>')
    for s in segments:
        rings = s["geometry"]["coordinates"]
        x, y = xy(*label_point(rings, s["centroid"]))
        classes = s["featureClasses"]
        marks = "".join(m for c, m in (("road", "R"), ("structure", "B"), ("stream", "S"), ("water", "W")) if c in classes)
        out.append(f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" font-family="Helvetica" font-size="17" '
                   f'font-weight="bold">{s["segmentId"]}</text>')
        out.append(f'<text x="{x:.1f}" y="{y + 16:.1f}" text-anchor="middle" font-family="Helvetica" font-size="12" '
                   f'fill="#333333">{marks}</text>')
    legend_y = height - 110
    out.append(f'<text x="40" y="{legend_y}" font-family="Helvetica" font-size="18">Under each id: R road, B building or '
               'structure, S stream, W water.</text>')
    out.append(f'<rect x="40" y="{legend_y + 18}" width="26" height="18" fill="{fill["water"]}" stroke="#555555"/>'
               f'<text x="74" y="{legend_y + 33}" font-family="Helvetica" font-size="16">water</text>')
    out.append(f'<rect x="160" y="{legend_y + 18}" width="26" height="18" fill="{fill["stream"]}" stroke="#555555"/>'
               f'<text x="194" y="{legend_y + 33}" font-family="Helvetica" font-size="16">stream</text>')
    with open(GRID_FILE, encoding="utf-8") as f:
        attribution = json.load(f).get("attribution", "")
    out.append(f'<text x="40" y="{height - 30}" font-family="Helvetica" font-size="14" fill="#555555">{attribution}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


# --- convert ---------------------------------------------------------------------------------------------------------

class SheetError(Exception):
    pass


def key_from_sheet(text):
    """The key JSON's text from a filled sheet, each value exactly as written. Raises SheetError naming the row."""
    lines = [line for line in text.splitlines() if not line.lstrip().startswith("#")]
    reader = csv.reader(lines)
    header = next(reader, None)
    if header != COLUMNS:
        raise SheetError(f"the header must be {','.join(COLUMNS)}")
    ids = set(segment_ids())
    rows = []
    for number, cells in enumerate(reader, start=1):
        if not any(c.strip() for c in cells):
            continue
        if len(cells) != len(COLUMNS):
            raise SheetError(f"row {number}: {len(cells)} cells, want {len(COLUMNS)}")
        text_cell, kind, segments, feature = cells
        if not text_cell.strip():
            raise SheetError(f"row {number}: report_text is empty")
        if text_cell != text_cell.strip():
            raise SheetError(f"row {number}: report_text starts or ends with a space; remove it so the key holds the words")
        if kind not in KINDS:
            raise SheetError(f"row {number}: expected_kind {kind!r} is not one of {', '.join(KINDS)}")
        segment_list = segments.split()
        if len(segment_list) > MAX_SEGMENTS:
            raise SheetError(f"row {number}: {len(segment_list)} segment ids, at most {MAX_SEGMENTS}")
        for s in segment_list:
            if s not in ids:
                raise SheetError(f"row {number}: segment id {s!r} is not on the {GRID_ID} grid")
        if feature not in FEATURES:
            raise SheetError(f"row {number}: place_feature {feature!r} is not one of {', '.join(FEATURES)}")
        rows.append({"n": len(rows) + 1, "text": text_cell, "kind": kind, "segments": segment_list, "feature": feature})
    if not rows:
        raise SheetError("no filled rows")
    key = {"answerKey": KEY_NAME, "writtenBy": "person", "grid": GRID_ID, "rows": rows}
    return json.dumps(key, ensure_ascii=False, indent=2) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("template")
    sub.add_parser("picture")
    convert = sub.add_parser("convert")
    convert.add_argument("sheet")
    args = parser.parse_args(argv)
    if args.command == "template":
        with open(TEMPLATE, "w", encoding="utf-8", newline="") as f:
            f.write(template_text())
        print(f"wrote {TEMPLATE}")
        return 0
    if args.command == "picture":
        with open(PICTURE, "w", encoding="utf-8") as f:
            f.write(picture_svg())
        print(f"wrote {PICTURE}")
        if shutil.which("rsvg-convert"):
            png = PICTURE[:-4] + ".png"
            subprocess.run(["rsvg-convert", "-o", png, PICTURE], check=True)
            print(f"wrote {png}")
        return 0
    if os.path.exists(KEY_FILE):
        print(f"{KEY_FILE} exists: a key is never edited after a run; a changed key gets a new name", file=sys.stderr)
        return 1
    with open(args.sheet, encoding="utf-8-sig", newline="") as f:
        sheet = f.read()
    try:
        text = key_from_sheet(sheet)
    except SheetError as e:
        print(f"not converted: {e}", file=sys.stderr)
        return 1
    with open(KEY_FILE, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
    print(f"wrote {KEY_FILE} ({len(json.loads(text)['rows'])} rows)")
    print(f"SHA-256 {sha}: set EvalKeyPinTests.pinnedSHA256 to it, then bundle the key in the app (ios/project.yml).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
