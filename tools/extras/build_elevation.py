"""Sample ground elevation for each segment of a search grid from the USGS 3D Elevation Program.

Reads elevation through the USGS Elevation Point Query Service (US public domain; credit "U.S. Geological Survey",
see tools/extras/SOURCE.md) at five points per cell: the centroid and four points halfway to the corners of the
cell's box, keeping only those inside the cell. It sends only those sample points, never a start point or an
address. Requests are paced (one a second by default). A server error is retried once after a 10 s pause; nothing is
retried in a loop, and any other failed or implausible answer stops the run and writes no file.

    python3 -I tools/extras/build_elevation.py --grid shared/grid/<site>.grid.json \
        --out web/public/extras/terrain/<gridId>.elevation.json [--pace-s 1.0]
    python3 -I tools/extras/build_elevation.py --check --grid <same> --out <same>   # exit 1: a cell is missing or the grid changed

The output is a display layer only: the search prior has no elevation term. Standard library only.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

EPQS = "https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&wkid=4326&units=Meters&includeDate=false"
SOURCE = "USGS 3DEP via the Elevation Point Query Service"
LICENSE = "US public domain"
CREDIT = "U.S. Geological Survey"
SAMPLES_PER_CELL = 5
# A plausible ground height in metres; anything outside (including a service no-data value) is refused.
MIN_M, MAX_M = -500.0, 9000.0

# A server error (HTTP 5xx) is retried once, after this pause; nothing else is retried, and never in a loop.
RETRY_PAUSE_S = 10.0

Fetch = Callable[[float, float], bytes]


class ServerError(Exception):
    """The service answered with a server error (HTTP 5xx): the one failure worth a single, paced retry."""


def _inside(lat: float, lon: float, ring: list) -> bool:
    """Ray casting on one ring of [lon, lat] positions."""
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def _contains(geometry: dict, lat: float, lon: float) -> bool:
    polys = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    for rings in polys:
        if _inside(lat, lon, rings[0]) and not any(_inside(lat, lon, hole) for hole in rings[1:]):
            return True
    return False


def sample_points(cell: dict) -> list[tuple[float, float]]:
    """(lat, lon): the centroid plus four points halfway to the corners of the cell's box, each kept only if inside."""
    g = cell["geometry"]
    rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]]
    lons = [p[0] for r in rings for p in r]
    lats = [p[1] for r in rings for p in r]
    c_lat, c_lon = cell["centroid"]["lat"], cell["centroid"]["lon"]
    points = [(c_lat, c_lon)]
    for corner_lat, corner_lon in ((min(lats), min(lons)), (min(lats), max(lons)), (max(lats), max(lons)), (max(lats), min(lons))):
        lat, lon = (c_lat + corner_lat) / 2, (c_lon + corner_lon) / 2
        if _contains(g, lat, lon):
            points.append((lat, lon))
    return points


def parse_epqs(body: bytes) -> float:
    """The elevation in metres. Raises on non-JSON (a challenge page served with status 200), a missing value, or
    a value outside -500 to 9000 m."""
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError) as e:
        raise ValueError("the answer is not JSON") from e
    if not isinstance(data, dict) or data.get("value") is None:
        raise ValueError("the answer has no value")
    try:
        value = float(data["value"])
    except (TypeError, ValueError) as e:
        raise ValueError(f"the value is not a number: {data['value']!r}") from e
    if not (MIN_M <= value <= MAX_M):
        raise ValueError(f"the value is outside {MIN_M} to {MAX_M} m: {value}")
    return value


def build(grid: dict, fetch: Fetch, sleep: Callable[[float], None], today: str, pace_s: float = 1.0) -> dict:
    """Every cell's mean, min and max elevation. Raises on the first failure; the caller writes nothing then."""
    cells: dict[str, dict] = {}
    plan = [(cell, sample_points(cell)) for cell in grid["segments"]]
    total = sum(len(points) for _, points in plan)
    i = 0
    for cell, points in plan:
        values = []
        for lat, lon in points:
            if i > 0:
                sleep(pace_s)
            i += 1
            where = f"cell {cell['segmentId']}, request {i} of {total} ({lat:.6f}, {lon:.6f})"
            try:
                try:
                    body = fetch(lat, lon)
                except ServerError:
                    sleep(RETRY_PAUSE_S)
                    body = fetch(lat, lon)
                values.append(parse_epqs(body))
            except (ServerError, OSError, ValueError) as e:
                raise ValueError(f"{where}: {e}") from e
        cells[cell["segmentId"]] = {
            "meanM": round(sum(values) / len(values), 2),
            "minM": round(min(values), 2),
            "maxM": round(max(values), 2),
            "n": len(values),
        }
    return {
        "gridId": grid["gridId"],
        "gridSha256": "",
        "source": SOURCE,
        "license": LICENSE,
        "credit": CREDIT,
        "fetchedAt": today,
        "samplesPerCell": SAMPLES_PER_CELL,
        "units": "metres",
        "cells": cells,
    }


def with_grid_hash(out: dict, grid_bytes: bytes) -> dict:
    return {**out, "gridSha256": hashlib.sha256(grid_bytes).hexdigest()}


def check(grid_bytes: bytes, out: dict) -> list[str]:
    problems = []
    if out.get("gridSha256") != hashlib.sha256(grid_bytes).hexdigest():
        problems.append("the grid changed since the elevation file was built")
    grid = json.loads(grid_bytes)
    for cell in grid["segments"]:
        if cell["segmentId"] not in out.get("cells", {}):
            problems.append(f"cell {cell['segmentId']} has no elevation")
    return problems


def http_fetch(lat: float, lon: float) -> bytes:
    req = urllib.request.Request(EPQS.format(lat=lat, lon=lon), headers={"User-Agent": "pls-extras-elevation/1.0"})
    try:
        res = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as e:
        if e.code >= 500:
            raise ServerError(f"HTTP {e.code}") from e
        raise
    with res:
        if "json" not in (res.headers.get("content-type") or ""):
            raise ValueError(f"the answer is not JSON (content type {res.headers.get('content-type')!r})")
        return res.read()


def main(argv: list[str] | None = None, fetch: Fetch = http_fetch, sleep: Callable[[float], None] = time.sleep,
         today: str | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--grid", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pace-s", type=float, default=1.0)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args(argv)
    if args.pace_s < 1.0:
        print("build_elevation: the pace is at least 1 s a request", file=sys.stderr)
        return 2
    try:
        grid_bytes = Path(args.grid).read_bytes()
        grid = json.loads(grid_bytes)
        if not isinstance(grid, dict) or not isinstance(grid.get("segments"), list):
            raise ValueError("it has no segments")
    except (OSError, ValueError) as e:
        print(f"build_elevation: cannot read the grid {args.grid}: {e}", file=sys.stderr)
        return 2
    out = Path(args.out)
    if args.check:
        if not out.exists():
            print(f"build_elevation: {out} is missing", file=sys.stderr)
            return 1
        problems = check(grid_bytes, json.loads(out.read_text(encoding="utf-8")))
        for p in problems:
            print(f"build_elevation: {p}", file=sys.stderr)
        if not problems:
            print(f"build_elevation: {out} matches {args.grid}")
        return 1 if problems else 0
    stamp = today or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    try:
        result = with_grid_hash(build(grid, fetch, sleep, stamp, args.pace_s), grid_bytes)
    except (OSError, ValueError) as e:
        print(f"build_elevation: stopped, no file written: {e}", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"build_elevation: wrote {out} ({len(result['cells'])} cells)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
