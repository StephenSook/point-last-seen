"""Import a role-player's GPS track after a drill, and measure each team's closest pass to her.

A role-player who plays the missing person carries a GPS logger. After the drill, this tool reads the logger's GPX file
and keeps only time, latitude and longitude, only for points inside the drill grid's box (plus a margin) and inside the
drill's time window. A logger left on during the drive (a home, a car park) therefore never reaches any file. It refuses
a track whose times run backwards or that jumps faster than a person moves (a GPS glitch to trim by hand), and thins it
to one point per five seconds.

It writes two files:
- the track itself, only inside a folder whose name ends in ".local" and that lies outside this repository (where no
  build can serve it, no dev server can read it and no commit can take it): a person's track is not published without
  that person's written consent;
- the closest passes, for the published run: for each team, the report placed by its phone's GPS that was nearest to
  where she was at that moment, as team, event id, distance rounded to the nearest 10 m (0 for under 10 m, read as
  "within 10 m"), the report's time and the phone's stated accuracy. It holds no coordinate and no unrounded distance,
  so it may be served beside the run; the role-player agrees to that before the drill. Teams carry no logger, so a pass is measured only at the moments a
  team sent a report.
A track marked synthetic (made up for tests) never has its passes written inside the repository.

    python3 -I tools/extras/import_track.py --gpx <file.gpx> --grid shared/grid/<gridId>.grid.json \\
        --run web/public/evidence/published-run.json --from <ISO time> --to <ISO time> --source gps-logger \\
        --track-out ~/pls-tracks.local/<runId>.track.json \\
        --passes-out web/public/extras/passes/<runId>.passes.json

Standard library only.
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import os
import sys
import tempfile
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
# The repository this tool lives in: no track, and no synthetic passes file, is ever written inside it.
REPO = Path(__file__).resolve().parents[2]


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
    return [p for seg in read_gpx(data) for p in seg]


def read_gpx(data: bytes) -> list[list[tuple[int, float, float]]]:
    """The track points as segments: a new GPX <trkseg> starts a new one (the logger was stopped and started)."""
    if len(data) > MAX_GPX_BYTES:
        raise ValueError(f"the GPX file is larger than {MAX_GPX_BYTES} bytes")
    # Read as UTF-8 only, so the scan below sees the text the parser will see (a UTF-16 file could hide a DOCTYPE).
    # A byte-order mark or any NUL byte (XML never holds one; UTF-16 and UTF-32 always do) means it is not UTF-8.
    if data.startswith((b"\xff\xfe", b"\xfe\xff")) or b"\x00" in data:
        raise ValueError("the GPX file is not UTF-8")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise ValueError("the GPX file is not UTF-8") from e
    # A GPX file never needs a DOCTYPE or an entity. Refusing both before parsing closes external-entity and
    # entity-expansion tricks without a third-party parser.
    head = text.upper()
    if "<!DOCTYPE" in head or "<!ENTITY" in head:
        raise ValueError("the file declares a DOCTYPE or an ENTITY, which a GPX file never needs")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        raise ValueError("not a GPX file") from e
    if _local(root.tag) != "gpx":
        raise ValueError("not a GPX file")
    segments: list[list[tuple[int, float, float]]] = []
    n = 0
    for pt in root.iter():
        if _local(pt.tag) == "trkseg":
            segments.append([])
            continue
        if _local(pt.tag) != "trkpt":
            continue
        n += 1
        if not segments:
            segments.append([])
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
        segments[-1].append((t_ms, round(lat, 6), round(lon, 6)))
    segments = [seg for seg in segments if seg]
    if not segments:
        raise ValueError("the GPX file has no track points")
    return segments


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


def clip_segments(segments, bbox, margin_m, from_ms, to_ms):
    """As clip, per segment; a dropped point splits its segment, so no place is ever drawn across it."""
    out, out_area, out_window = [], 0, 0
    for seg in segments:
        current = []
        for p in seg:
            kept, a, w = clip([p], bbox, margin_m, from_ms, to_ms)
            out_area, out_window = out_area + a, out_window + w
            if kept:
                current.append(p)
            elif current:
                out.append(current)
                current = []
        if current:
            out.append(current)
    return out, out_area, out_window


def check_speed(points, max_mps: float) -> None:
    """Raises when a point is not later than the one before it, or was reached faster than max_mps."""
    for i in range(1, len(points)):
        (t0, la0, lo0), (t1, la1, lo1) = points[i - 1], points[i]
        if t1 <= t0:
            raise ValueError(f"point {i + 1} is not later than the point before it")
        mps = distance_m(la0, lo0, la1, lo1) / ((t1 - t0) / 1000)
        if mps > max_mps:
            raise ValueError(f"point {i + 1} ({iso_utc(t1)}) was reached at {mps:.1f} m/s, faster than {max_mps} m/s: trim it by hand")


def thin(points, min_gap_ms: int, max_gap_ms: int = MAX_GAP_MS):
    """The first and last points, and each point at least min_gap_ms after the last one kept. A point is never dropped
    when dropping it would leave a gap longer than max_gap_ms, which a reader takes for a stop in the recording."""
    kept = []
    for i, p in enumerate(points):
        nxt = points[i + 1] if i + 1 < len(points) else None
        if not kept or nxt is None or p[0] - kept[-1][0] >= min_gap_ms or nxt[0] - kept[-1][0] > max_gap_ms:
            kept.append(p)
    return kept


def position_at(track, t_ms: int, max_gap_ms: int = MAX_GAP_MS):
    """(lat, lon) at t_ms on the straight line between the two points around it; None outside the track or in a gap."""
    if not track or t_ms < track[0][0] or t_ms > track[-1][0]:
        return None
    # A recorded fix at that moment is the place, whatever the gaps around it.
    for t, lat, lon in track:
        if t == t_ms:
            return (lat, lon)
    for (t0, la0, lo0), (t1, la1, lo1) in zip(track, track[1:]):
        if t0 <= t_ms <= t1:
            if t1 - t0 > max_gap_ms:
                return None
            f = (t_ms - t0) / (t1 - t0)
            return (la0 + f * (la1 - la0), lo0 + f * (lo1 - lo0))
    return (track[-1][1], track[-1][2]) if t_ms == track[-1][0] else None


def position_in(segments, t_ms: int):
    """The place at t_ms in the one segment whose time span holds it; None between segments, outside or in a gap."""
    for seg in segments:
        if seg and seg[0][0] <= t_ms <= seg[-1][0]:
            return position_at(seg, t_ms)
    return None


def _number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def team_samples(run: dict) -> list[dict]:
    """Each searcher report placed by its phone's GPS, at the phone's time plus the phone's measured clock offset.

    A phone whose offset was never measured is taken at its own clock and marked clockChecked False, so the line can
    say so. A report whose place is not two numbers is skipped; an accuracy that is not a number is dropped.
    """
    offsets = {d["deviceId"]: d.get("clockOffsetMs") for d in run.get("devices", [])}
    out = []
    for e in run.get("events", []):
        pos = e.get("position")
        if e.get("role") != "searcher" or not e.get("teamId") or e.get("positionSource") != "gps" or not isinstance(pos, dict):
            continue
        if not (_number(pos.get("lat")) and _number(pos.get("lon")) and _number(e.get("clientTimeMs"))):
            continue
        offset = offsets.get(e["deviceId"])
        checked = _number(offset)
        acc = pos.get("accuracyM")
        out.append({"teamId": e["teamId"], "eventId": e["eventId"], "tMs": e["clientTimeMs"] + (offset if checked else 0),
                    "lat": pos["lat"], "lon": pos["lon"], "accuracyM": acc if _number(acc) and acc >= 0 else None,
                    "clockChecked": checked})
    return out


def published_distance(d: float) -> int:
    """A distance as published: rounded to the nearest 10 m (a half rounds up), and 0, read as "within 10 m", for
    anything under 10 m. A published pass then never pins one point of the role-player's track."""
    return 0 if d < 10 else int(math.floor(d / 10 + 0.5)) * 10


def closest_passes(segments, samples) -> list[dict]:
    """Per team, sorted by team id: its report nearest to her at that moment (ties to the earlier report)."""
    best: dict[str, tuple[float, int, dict]] = {}
    for s in samples:
        here = position_in(segments, s["tMs"])
        if here is None:
            continue
        d = distance_m(here[0], here[1], s["lat"], s["lon"])
        key = (d, s["tMs"])
        if s["teamId"] not in best or key < best[s["teamId"]][:2]:
            best[s["teamId"]] = (d, s["tMs"], s)
    return [
        {"teamId": team, "eventId": s["eventId"], "distanceM": published_distance(d), "atMs": s["tMs"], "accuracyM": s["accuracyM"],
         "clockChecked": s["clockChecked"]}
        for team, (d, _, s) in sorted(best.items())
    ]


def _in_local_folder(path: Path) -> bool:
    """The real folder (links followed) has a part whose name ends in .local."""
    return any(part.casefold().endswith(".local") for part in path.resolve().parent.parts)


def _inside(path: Path, root: Path) -> bool:
    """Whether the real path (links followed) is root or under it, letter case ignored (a case-blind disk)."""
    p, r = str(path.resolve()).casefold(), str(root.resolve()).casefold()
    return p == r or p.startswith(r + os.sep)


def _inside_as_written(path: Path, root: Path) -> bool:
    """Whether the path as written (links not followed) is root or under it, letter case ignored: a link inside the
    repository that points outside still makes the file reachable through the repository."""
    p = os.path.abspath(path).casefold()
    return any(p == r or p.startswith(r + os.sep) for r in {os.path.abspath(root).casefold(), str(root.resolve()).casefold()})


def _ancestors(path: Path):
    p = Path(os.path.abspath(path))
    yield p
    yield from p.parents


def _inside_repository(path: Path, root: Path) -> bool:
    """Whether the path, as written or with links followed, lies in the repository. Folders are compared as folders
    (device and inode), so another name for the repository (a link, a letter-case variant, the Mac's
    /System/Volumes/Data path) is still the repository. The name checks remain for a root that does not exist yet."""
    try:
        root_stat = os.stat(root)
    except OSError:
        root_stat = None
    if root_stat is not None:
        for a in [*_ancestors(path), *_ancestors(path.resolve())]:
            try:
                if os.path.samestat(os.stat(a), root_stat):
                    return True
            except OSError:
                continue
    return _inside(path, root) or _inside_as_written(path, root)


def _write(path: Path, data: dict) -> None:
    """Writes through a new temporary file (created exclusively, so a link planted beside it is never followed)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, indent=2) + "\n")
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def main(argv: list[str] | None = None, repo_root: Path = REPO) -> int:
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
    if track_out.is_symlink() or not _in_local_folder(track_out) or _inside_repository(track_out, repo_root):
        print(f"import_track: the track is a person's location; write it only inside a *.local folder outside the "
              f"repository, and not through a link: not {track_out}", file=sys.stderr)
        return 2
    if args.source == "synthetic" and _inside_repository(passes_out, repo_root):
        print("import_track: a synthetic track's passes are never written inside the repository", file=sys.stderr)
        return 2
    try:
        from_ms, to_ms = parse_time(args.from_), parse_time(args.to)
        if to_ms <= from_ms:
            raise ValueError("--to is not after --from")
        grid = json.loads(Path(args.grid).read_text(encoding="utf-8"))
        run = json.loads(Path(args.run).read_text(encoding="utf-8"))
        gpx_path = Path(args.gpx)
        if gpx_path.stat().st_size > MAX_GPX_BYTES:
            raise ValueError(f"the GPX file is larger than {MAX_GPX_BYTES} bytes")
        segments = read_gpx(gpx_path.read_bytes())
        read_count = sum(len(seg) for seg in segments)
        kept, out_area, out_window = clip_segments(segments, grid["bbox"], MARGIN_M, from_ms, to_ms)
        if not kept:
            raise ValueError("no point of the track is inside the drill area and window")
        for seg in kept:
            check_speed(seg, MAX_SPEED_MPS)
        check_speed([p for seg in kept for p in seg], float("inf"))  # times run forward across segments too
        # Passes are measured on every kept point; only the written track is thinned.
        thinned = [thin(seg, THIN_MS) for seg in kept]
    except (OSError, ValueError, KeyError) as e:
        print(f"import_track: stopped, nothing written: {e}", file=sys.stderr)
        return 1
    passes = closest_passes(kept, team_samples(run))
    points = [p for seg in thinned for p in seg]
    # Where each segment after the first starts in the points, so a reader never draws across a stop.
    breaks, at = [], 0
    for seg in thinned[:-1]:
        at += len(seg)
        breaks.append(at)
    _write(track_out, {"version": 1, "source": args.source, "gridId": grid["gridId"], "runId": run["runId"],
                       "points": [[t, lat, lon] for t, lat, lon in points], "breaks": breaks})
    # The span is that of every kept point, as the passes were measured on them.
    _write(passes_out, {"version": 1, "runId": run["runId"], "source": args.source, "basis": "reports",
                        "trackFromMs": kept[0][0][0], "trackToMs": kept[-1][-1][0], "passes": passes})
    kept_count = sum(len(seg) for seg in kept)
    print(f"import_track: kept {len(points)} of {read_count} points ({out_area} outside the drill area, {out_window} outside "
          f"the window, {kept_count - len(points)} thinned to one per {THIN_MS // 1000} s); {len(passes)} team passes; "
          f"track in {track_out}, passes in {passes_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
