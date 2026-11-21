"""Import a role-player's GPS track after a drill, and measure each team's closest pass to her.

A role-player who plays the missing person carries a GPS logger. After the drill, this tool reads the logger's GPX file
and keeps only time, latitude and longitude, only for points inside the drill grid's box (plus a margin) and inside the
drill's time window. A logger left on during the drive (a home, a car park) therefore never reaches any file. It refuses
a track whose times run backwards or that jumps faster than a person moves (a GPS glitch to trim by hand), and thins it
to one point per five seconds.

It writes two files:
- the track itself, only inside a folder whose name ends in ".local" (gitignored): a person's track is not published
  without that person's written consent;
- the closest passes, for the published run: for each team, the report placed by its phone's GPS that was nearest to
  where she was at that moment, as team, event id, whole metres, time and the phone's stated accuracy. It holds no
  coordinate, so it may be served beside the run. Teams carry no logger, so a pass is measured only at the moments a
  team sent a report.
A track marked synthetic (made up for tests) is never written into the served site.

    python3 -I tools/extras/import_track.py --gpx <file.gpx> --grid shared/grid/<gridId>.grid.json \\
        --run web/public/evidence/published-run.json --from <ISO time> --to <ISO time> --source gps-logger \\
        --track-out tools/extras/tracks.local/<runId>.track.json \\
        --passes-out web/public/extras/passes/<runId>.passes.json

Standard library only.
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

EARTH_R_M = 6_371_008.8
# Beyond the grid's box, a point is still kept within this distance (ours): the role-player can step past an edge.
MARGIN_M = 200.0
# Faster than this between two points is a GPS glitch, not a walk or a run (ours).
MAX_SPEED_MPS = 8.0
# At most one point per this many milliseconds is kept.
THIN_MS = 5_000
# A gap longer than this has no position inside it: the logger lost its fix, and the tool does not guess.
MAX_GAP_MS = 120_000
# A GPX file larger than this is refused before it is parsed.
MAX_GPX_BYTES = 20_000_000
SOURCES = ("gps-logger", "synthetic")


def iso_utc(t_ms: int) -> str:
    """'2026-11-22T18:00:00Z' (milliseconds shown only when not zero)."""
    dt = datetime.datetime.fromtimestamp(t_ms / 1000, datetime.timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + (f".{t_ms % 1000:03d}" if t_ms % 1000 else "") + "Z"


def parse_time(text: str) -> int:
    """Milliseconds since 1970 from an ISO 8601 time that names its zone ('Z' or an offset)."""
    try:
        dt = datetime.datetime.fromisoformat(text.strip().replace("Z", "+00:00"))
    except ValueError as e:
        raise ValueError(f"the time {text!r} cannot be read") from e
    if dt.tzinfo is None:
        raise ValueError(f"the time {text!r} has no time zone")
    return round(dt.timestamp() * 1000)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_gpx(data: bytes) -> list[tuple[int, float, float]]:
    """(time ms, lat, lon) for every track point, in file order. Elevation and everything else is dropped."""
    if len(data) > MAX_GPX_BYTES:
        raise ValueError(f"the GPX file is larger than {MAX_GPX_BYTES} bytes")
    # A GPX file never needs a DOCTYPE or an entity. Refusing both before parsing closes external-entity and
    # entity-expansion tricks without a third-party parser.
    head = data.upper()
    if b"<!DOCTYPE" in head or b"<!ENTITY" in head:
        raise ValueError("the file declares a DOCTYPE or an ENTITY, which a GPX file never needs")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        raise ValueError("not a GPX file") from e
    if _local(root.tag) != "gpx":
        raise ValueError("not a GPX file")
    points = []
    for n, pt in enumerate((el for el in root.iter() if _local(el.tag) == "trkpt"), start=1):
        try:
            lat, lon = float(pt.attrib["lat"]), float(pt.attrib["lon"])
        except (KeyError, ValueError) as e:
            raise ValueError(f"point {n} has no usable lat and lon") from e
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f"point {n} is not on the Earth: {lat}, {lon}")
        time = next((c.text for c in pt if _local(c.tag) == "time" and c.text), None)
        if time is None:
            raise ValueError(f"point {n} has no time")
        try:
            t_ms = parse_time(time)
        except ValueError as e:
            raise ValueError(f"point {n}: {e}") from e
        points.append((t_ms, round(lat, 6), round(lon, 6)))
    if not points:
        raise ValueError("the GPX file has no track points")
    return points


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance (haversine), as the replay's trail measures it."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_M * math.asin(math.sqrt(h))


def _outside_box(lat: float, lon: float, bbox: list[float], margin_m: float) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    dlat = margin_m / (EARTH_R_M * math.pi / 180)
    dlon = dlat / max(math.cos(math.radians(lat)), 1e-6)
    return not (min_lat - dlat <= lat <= max_lat + dlat and min_lon - dlon <= lon <= max_lon + dlon)


def clip(points, bbox, margin_m, from_ms, to_ms):
    """The points inside the grid's box (plus the margin) and inside the window, with how many were dropped for each."""
    kept, out_area, out_window = [], 0, 0
    for t, lat, lon in points:
        if _outside_box(lat, lon, bbox, margin_m):
            out_area += 1
        elif not (from_ms <= t <= to_ms):
            out_window += 1
        else:
            kept.append((t, lat, lon))
    return kept, out_area, out_window


def check_speed(points, max_mps: float) -> None:
    """Raises when a point is not later than the one before it, or was reached faster than max_mps."""
    for i in range(1, len(points)):
        (t0, la0, lo0), (t1, la1, lo1) = points[i - 1], points[i]
        if t1 <= t0:
            raise ValueError(f"point {i + 1} is not later than the point before it")
        mps = distance_m(la0, lo0, la1, lo1) / ((t1 - t0) / 1000)
        if mps > max_mps:
            raise ValueError(f"point {i + 1} ({iso_utc(t1)}) was reached at {mps:.1f} m/s, faster than {max_mps} m/s: trim it by hand")


def thin(points, min_gap_ms: int):
    """The first point, then each point at least min_gap_ms after the last one kept."""
    kept = []
    for p in points:
        if not kept or p[0] - kept[-1][0] >= min_gap_ms:
            kept.append(p)
    return kept


def position_at(track, t_ms: int, max_gap_ms: int = MAX_GAP_MS):
    """(lat, lon) at t_ms on the straight line between the two points around it; None outside the track or in a gap."""
    if not track or t_ms < track[0][0] or t_ms > track[-1][0]:
        return None
    for (t0, la0, lo0), (t1, la1, lo1) in zip(track, track[1:]):
        if t0 <= t_ms <= t1:
            if t1 - t0 > max_gap_ms:
                return None
            f = (t_ms - t0) / (t1 - t0)
            return (la0 + f * (la1 - la0), lo0 + f * (lo1 - lo0))
    return (track[-1][1], track[-1][2]) if t_ms == track[-1][0] else None


def team_samples(run: dict) -> list[dict]:
    """Each searcher report placed by its phone's GPS, at the phone's time plus the phone's measured clock offset."""
    offsets = {d["deviceId"]: d.get("clockOffsetMs") or 0 for d in run.get("devices", [])}
    out = []
    for e in run.get("events", []):
        pos = e.get("position")
        if e.get("role") != "searcher" or not e.get("teamId") or e.get("positionSource") != "gps" or not pos:
            continue
        out.append({"teamId": e["teamId"], "eventId": e["eventId"], "tMs": e["clientTimeMs"] + offsets.get(e["deviceId"], 0),
                    "lat": pos["lat"], "lon": pos["lon"], "accuracyM": pos.get("accuracyM")})
    return out


def closest_passes(track, samples) -> list[dict]:
    """Per team, sorted by team id: its report nearest to her at that moment (ties to the earlier report)."""
    best: dict[str, tuple[float, int, dict]] = {}
    for s in samples:
        here = position_at(track, s["tMs"])
        if here is None:
            continue
        d = distance_m(here[0], here[1], s["lat"], s["lon"])
        key = (d, s["tMs"])
        if s["teamId"] not in best or key < best[s["teamId"]][:2]:
            best[s["teamId"]] = (d, s["tMs"], s)
    return [
        {"teamId": team, "eventId": s["eventId"], "distanceM": round(d), "atMs": s["tMs"], "accuracyM": s["accuracyM"]}
        for team, (d, _, s) in sorted(best.items())
    ]


def _in_local_folder(path: Path) -> bool:
    return any(part.endswith(".local") for part in path.resolve().parent.parts)


def _in_served_site(path: Path) -> bool:
    parts = path.resolve().parts
    return any(a == "web" and b == "public" for a, b in zip(parts, parts[1:]))


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--gpx", required=True)
    ap.add_argument("--grid", required=True)
    ap.add_argument("--run", required=True, help="the published run the passes are for")
    ap.add_argument("--from", dest="from_", required=True, help="drill start, ISO 8601 with a zone")
    ap.add_argument("--to", required=True, help="drill end, ISO 8601 with a zone")
    ap.add_argument("--source", required=True, choices=SOURCES)
    ap.add_argument("--track-out", required=True, help="inside a folder whose name ends in .local")
    ap.add_argument("--passes-out", required=True)
    args = ap.parse_args(argv)
    track_out, passes_out = Path(args.track_out), Path(args.passes_out)
    if not _in_local_folder(track_out):
        print(f"import_track: the track is a person's location; write it only inside a *.local folder, not {track_out}", file=sys.stderr)
        return 2
    if args.source == "synthetic" and _in_served_site(passes_out):
        print("import_track: a synthetic track's passes never go into web/public", file=sys.stderr)
        return 2
    try:
        from_ms, to_ms = parse_time(args.from_), parse_time(args.to)
        if to_ms <= from_ms:
            raise ValueError("--to is not after --from")
        grid = json.loads(Path(args.grid).read_text(encoding="utf-8"))
        run = json.loads(Path(args.run).read_text(encoding="utf-8"))
        points = parse_gpx(Path(args.gpx).read_bytes())
        kept, out_area, out_window = clip(points, grid["bbox"], MARGIN_M, from_ms, to_ms)
        if not kept:
            raise ValueError("no point of the track is inside the drill area and window")
        check_speed(kept, MAX_SPEED_MPS)
        track = thin(kept, THIN_MS)
    except (OSError, ValueError, KeyError) as e:
        print(f"import_track: stopped, nothing written: {e}", file=sys.stderr)
        return 1
    passes = closest_passes(track, team_samples(run))
    _write(track_out, {"version": 1, "source": args.source, "gridId": grid["gridId"], "runId": run["runId"],
                       "points": [[t, lat, lon] for t, lat, lon in track]})
    _write(passes_out, {"version": 1, "runId": run["runId"], "source": args.source, "basis": "reports",
                        "trackFromMs": track[0][0], "trackToMs": track[-1][0], "passes": passes})
    print(f"import_track: kept {len(track)} of {len(points)} points ({out_area} outside the drill area, {out_window} outside "
          f"the window, {len(kept) - len(track)} thinned to one per {THIN_MS // 1000} s); {len(passes)} team passes; "
          f"track in {track_out}, passes in {passes_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
