"""Tests for import_track.py: a role-player's GPS track, kept local, and each team's closest pass, published.

Every track here is SYNTHETIC: made up for these tests around the Kennesaw drill grid's box. None is a real person's.
"""

import importlib.util
import json
import math
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("import_track", Path(__file__).with_name("import_track.py"))
it = importlib.util.module_from_spec(spec)
spec.loader.exec_module(it)

# The Kennesaw drill grid's box: [min lon, min lat, max lon, max lat].
BBOX = [-84.6092888, 33.9088029, -84.5858421, 33.944]
GRID = {"gridId": "kennesaw-mountain-drill", "bbox": BBOX, "segments": []}
T0 = 1_795_370_400_000  # 2026-11-22T18:00:00Z
LAT0, LON0 = 33.92, -84.60  # inside the box
DEG_LAT_M = 111_195.0  # metres per degree of latitude on the haversine sphere (R 6371008.8 m)


def gpx(points, ns="http://www.topografix.com/GPX/1/1", name="SYNTHETIC role-player track"):
    """A GPX 1.1 file from (t_ms, lat, lon, iso-or-None) tuples."""
    pts = []
    for t_ms, lat, lon, *iso in points:
        stamp = iso[0] if iso else it.iso_utc(t_ms)
        time = "" if stamp is None else f"<time>{stamp}</time>"
        pts.append(f'<trkpt lat="{lat}" lon="{lon}"><ele>300</ele>{time}</trkpt>')
    return (f'<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="{ns}"><trk><name>{name}</name><trkseg>'
            + "".join(pts) + "</trkseg></trk></gpx>").encode()


def walk(n, step_s=5, north_m=5.0, start=T0, lat0=LAT0, lon0=LON0):
    """n points walking north, step_s seconds and north_m metres apart."""
    return [(start + i * step_s * 1000, lat0 + i * north_m / DEG_LAT_M, lon0) for i in range(n)]


def run_file(events, devices=(), teams=({"teamId": "T1", "name": "Team 1"}, {"teamId": "T2", "name": "Team 2"})):
    return {"runId": "drill-test-2026-11-22", "label": "x", "teams": list(teams), "devices": list(devices), "events": events}


def report(event_id, team, device, t_ms, lat, lon, source="gps", accuracy=8.0, role="searcher", kind="clue"):
    return {"eventId": event_id, "teamId": team, "deviceId": device, "clientTimeMs": t_ms, "role": role, "type": kind,
            "position": None if lat is None else {"lat": lat, "lon": lon, "accuracyM": accuracy}, "positionSource": source}


# --- GPX ---

def test_reads_time_lat_and_lon_from_any_gpx_namespace_and_drops_the_rest():
    pts = walk(3)
    for ns in ("http://www.topografix.com/GPX/1/1", "http://www.topografix.com/GPX/1/0"):
        assert it.parse_gpx(gpx(pts, ns=ns)) == [(t, round(la, 6), round(lo, 6)) for t, la, lo in pts]


def test_reads_offsets_and_fractions_in_the_time_stamps():
    pts = [(T0, LAT0, LON0, "2026-11-22T13:00:00-05:00"), (T0 + 1500, LAT0, LON0, "2026-11-22T18:00:01.5Z")]
    assert [p[0] for p in it.parse_gpx(gpx(pts))] == [T0, T0 + 1500]


def test_refuses_a_point_with_no_time_a_time_with_no_zone_or_a_file_with_no_points():
    with pytest.raises(ValueError, match="point 2 has no time"):
        it.parse_gpx(gpx([(T0, LAT0, LON0), (T0 + 5000, LAT0, LON0, None)]))
    with pytest.raises(ValueError, match="no time zone"):
        it.parse_gpx(gpx([(T0, LAT0, LON0, "2026-11-22T18:00:00")]))
    with pytest.raises(ValueError, match="no track points"):
        it.parse_gpx(b'<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')
    with pytest.raises(ValueError, match="not a GPX file"):
        it.parse_gpx(b"not xml")


def test_refuses_any_file_that_declares_a_doctype_or_an_entity_before_parsing_it():
    # GPX never needs one; refusing it closes external-entity and entity-expansion tricks without a parser option.
    bomb = b'<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><gpx xmlns="x">&b;</gpx>'
    with pytest.raises(ValueError, match="declares a DOCTYPE or an ENTITY"):
        it.parse_gpx(bomb)
    with pytest.raises(ValueError, match="declares a DOCTYPE or an ENTITY"):
        it.parse_gpx(b'<?xml version="1.0"?><!DOCTYPE gpx SYSTEM "file:///etc/passwd"><gpx/>')


# --- what is kept ---

def test_keeps_only_points_inside_the_drill_area_and_window_so_a_drive_from_home_never_reaches_a_file():
    home = (T0 - 600_000, 33.80, -84.40)  # 20 km away, before the drill
    car_park = (T0 + 1_000, BBOX[1] - 0.01, LON0)  # 1.1 km south of the grid, inside the window
    late = (T0 + 7_200_000, LAT0, LON0)  # inside the area, after the window
    inside = walk(4, start=T0 + 60_000)
    kept, out_area, out_window = it.clip([home, car_park, *inside, late], BBOX, 200.0, T0, T0 + 3_600_000)
    assert kept == inside
    assert (out_area, out_window) == (2, 1)


def test_a_point_just_outside_the_box_but_inside_the_margin_is_kept():
    edge = (T0, BBOX[1] - 150 / DEG_LAT_M, LON0)  # 150 m south of the box, margin 200 m
    assert it.clip([edge], BBOX, 200.0, T0, T0 + 1)[0] == [edge]


def test_refuses_a_jump_faster_than_the_limit_and_says_where():
    pts = walk(3) + [(T0 + 15_000, LAT0 + 500 / DEG_LAT_M, LON0)]  # 490 m in 5 s
    with pytest.raises(ValueError, match=r"point 4 .* m/s"):
        it.check_speed(pts, 8.0)
    it.check_speed(walk(10), 8.0)


def test_refuses_times_that_go_backwards():
    with pytest.raises(ValueError, match="point 2 is not later"):
        it.check_speed([(T0, LAT0, LON0), (T0, LAT0, LON0)], 8.0)


def test_thins_to_one_point_per_five_seconds_and_keeps_the_last_point():
    pts = walk(13, step_s=1)
    assert [p[0] for p in it.thin(pts, 5_000)] == [T0, T0 + 5_000, T0 + 10_000, T0 + 12_000]


def test_thinning_never_opens_a_gap_longer_than_the_replay_allows():
    # Fixes at 0, 4 and 124 s: dropping the 4 s fix would leave a 124 s gap, which the replay reads as an outage.
    pts = [(T0, LAT0, LON0), (T0 + 4_000, LAT0, LON0), (T0 + 124_000, LAT0, LON0)]
    assert [p[0] for p in it.thin(pts, 5_000)] == [T0, T0 + 4_000, T0 + 124_000]


# --- where she was ---

def test_position_between_two_points_is_on_the_straight_line_between_them():
    a, b = (T0, LAT0, LON0), (T0 + 10_000, LAT0 + 0.001, LON0 + 0.002)
    assert it.position_at([a, b], T0 + 2_500) == pytest.approx((LAT0 + 0.00025, LON0 + 0.0005))
    assert it.position_at([a, b], T0) == (LAT0, LON0)


def test_no_position_outside_the_track_or_across_a_gap_longer_than_two_minutes():
    track = [(T0, LAT0, LON0), (T0 + 10_000, LAT0, LON0), (T0 + 200_000, LAT0, LON0)]
    assert it.position_at(track, T0 - 1) is None
    assert it.position_at(track, T0 + 200_001) is None
    assert it.position_at(track, T0 + 100_000) is None


# --- the teams' reports ---

def test_team_samples_are_team_reports_placed_by_the_phone_gps_at_the_phone_time_plus_its_offset():
    devices = [{"deviceId": "device-2", "teamId": "T1", "clockOffsetMs": 2_000}]
    events = [
        report("a", "T1", "device-2", T0, LAT0, LON0),
        report("b", "T1", "device-2", T0, LAT0, LON0, source="assigned_segment"),  # where it was sent, not where it was
        report("c", None, "device-1", T0, LAT0, LON0, role="family"),
        report("d", "T2", "device-3", T0, None, None, source="none"),
        report("e", "T1", "device-2", T0, LAT0, LON0, kind="confirmation", role="command"),
    ]
    assert it.team_samples(run_file(events, devices)) == [
        {"teamId": "T1", "eventId": "a", "tMs": T0 + 2_000, "lat": LAT0, "lon": LON0, "accuracyM": 8.0, "clockChecked": True}
    ]


# --- closest passes ---

def test_each_team_gets_its_report_nearest_her_at_that_moment_rounded_to_10_m():
    track = walk(121)  # 10 minutes walking north at 1 m/s
    def at(i):
        return track[i][1], track[i][2]
    samples = [
        # Team 1: 40 m east of her at minute 2, then 27 m east of her at minute 6 (published as 30 m).
        {"teamId": "T1", "eventId": "t1-early", "tMs": track[24][0], "lat": at(24)[0], "lon": at(24)[1] + 40 / (DEG_LAT_M * math.cos(math.radians(LAT0))), "accuracyM": 8.0, "clockChecked": True},
        {"teamId": "T1", "eventId": "t1-late", "tMs": track[72][0], "lat": at(72)[0], "lon": at(72)[1] + 27 / (DEG_LAT_M * math.cos(math.radians(LAT0))), "accuracyM": None, "clockChecked": True},
        # Team 2: 300 m south of where she was; and one report before her track starts, which is skipped.
        {"teamId": "T2", "eventId": "t2", "tMs": track[60][0], "lat": at(60)[0] - 300 / DEG_LAT_M, "lon": at(60)[1], "accuracyM": 12.0, "clockChecked": False},
        {"teamId": "T2", "eventId": "t2-before", "tMs": T0 - 60_000, "lat": LAT0, "lon": LON0, "accuracyM": 5.0, "clockChecked": True},
    ]
    assert it.closest_passes([track], samples) == [
        {"teamId": "T1", "eventId": "t1-late", "distanceM": 30, "atMs": track[72][0], "accuracyM": None, "clockChecked": True},
        {"teamId": "T2", "eventId": "t2", "distanceM": 300, "atMs": track[60][0], "accuracyM": 12.0, "clockChecked": False},
    ]


def test_a_published_distance_is_rounded_to_the_nearest_10_m_and_under_10_m_is_0_never_less_coarse():
    # So a pass never pins one point of the role-player's track: 0 means "within 10 m".
    assert [it.published_distance(d) for d in (0.0, 6.0, 9.99, 10.0, 12.0, 14.9, 15.0, 25.0, 298.0)] == [0, 0, 0, 10, 10, 10, 20, 30, 300]


def test_a_tie_goes_to_the_earlier_report():
    track = walk(20)
    samples = [{"teamId": "T1", "eventId": e, "tMs": track[i][0], "lat": track[i][1], "lon": track[i][2], "accuracyM": None, "clockChecked": True} for e, i in (("late", 9), ("early", 3))]
    assert it.closest_passes([track], samples)[0]["eventId"] == "early"


# --- segments, gaps and what is measured (from a second-model review) ---

def two_segments(a, b):
    """A GPX file whose points come in two <trkseg> elements: the logger was stopped and started again."""
    seg = lambda pts: "<trkseg>" + "".join(f'<trkpt lat="{la}" lon="{lo}"><time>{it.iso_utc(t)}</time></trkpt>' for t, la, lo in pts) + "</trkseg>"
    return (f'<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk>{seg(a)}{seg(b)}</trk></gpx>').encode()


def test_each_gpx_segment_stays_its_own_segment_and_no_position_is_drawn_between_two():
    a, b = walk(13), walk(13, start=T0 + 120_000)  # stopped at 18:01:00, started again at 18:02:00
    segs = it.read_gpx(two_segments(a, b))
    assert [len(s) for s in segs] == [13, 13]
    assert it.position_in(segs, T0 + 90_000) is None  # 30 s inside the stop: no invented place
    assert it.position_in(segs, T0 + 30_000) is not None


def test_a_dropped_point_splits_its_segment_so_nothing_is_drawn_across_it():
    out = (T0 + 30_000, BBOX[1] - 0.01, LON0)  # outside the area
    segs, out_area, _ = it.clip_segments([[*walk(6), out, *walk(6, start=T0 + 35_000)]], BBOX, 200.0, T0, T0 + 3_600_000)
    assert out_area == 1 and [len(s) for s in segs] == [6, 6]
    assert it.position_in(segs, T0 + 30_000) is None


def test_a_report_at_a_recorded_fix_has_that_fix_even_right_after_a_gap():
    track = [(T0, LAT0, LON0), (T0 + 121_000, LAT0 + 0.001, LON0), (T0 + 126_000, LAT0 + 0.0011, LON0)]
    assert it.position_in([track], T0 + 121_000) == (LAT0 + 0.001, LON0)
    assert it.position_in([track], T0 + 60_000) is None


def test_passes_are_measured_on_every_kept_point_not_the_thinned_track(tmp_path):
    # Fixes at 0, 2 and 5 s; the report sits exactly on the 2 s fix, which thinning to one per 5 s drops.
    pts = [(T0 + 60_000, 33.9200, LON0), (T0 + 62_000, 33.9201, LON0), (T0 + 65_000, 33.9200, LON0)]
    runs = [report("r1", "T1", "device-2", T0 + 62_000, 33.9201, LON0)]
    track_out, passes_out = tmp_path / "out.local" / "t.json", tmp_path / "p.json"
    assert cli(tmp_path, track_out, passes_out, points=pts, events=runs) == 0
    assert json.loads(passes_out.read_text())["passes"][0]["distanceM"] == 0
    assert len(json.loads(track_out.read_text())["points"]) == 2


def test_the_track_file_records_where_each_new_segment_starts(tmp_path):
    a, b = walk(13, start=T0 + 60_000), walk(13, start=T0 + 180_000)
    track_out = tmp_path / "out.local" / "t.json"
    assert cli(tmp_path, track_out, tmp_path / "p.json", events=[], gpx_bytes=two_segments(a, b)) == 0
    t = json.loads(track_out.read_text())
    assert t["breaks"] == [len([p for p in it.thin(a, 5_000)])]


def test_a_report_with_an_unreadable_accuracy_or_place_is_cleaned_or_skipped():
    devices = [{"deviceId": "device-2", "teamId": "T1", "clockOffsetMs": 0}]
    odd = report("a", "T1", "device-2", T0, LAT0, LON0)
    odd["position"]["accuracyM"] = {"lat": 33.92, "lon": -84.6}
    nowhere = report("b", "T1", "device-2", T0, LAT0, LON0)
    nowhere["position"]["lat"] = "33.92"
    samples = it.team_samples(run_file([odd, nowhere], devices))
    assert [s["eventId"] for s in samples] == ["a"]
    assert samples[0]["accuracyM"] is None


def test_a_phone_whose_clock_offset_was_never_measured_is_marked_so():
    events = [report("a", "T1", "device-2", T0, LAT0, LON0), report("b", "T1", "device-3", T0, LAT0, LON0), report("c", "T1", "device-4", T0, LAT0, LON0)]
    devices = [{"deviceId": "device-2", "teamId": "T1", "clockOffsetMs": 0}, {"deviceId": "device-3", "teamId": "T1", "clockOffsetMs": None}]
    assert [(s["eventId"], s["clockChecked"]) for s in it.team_samples(run_file(events, devices))] == [("a", True), ("b", False), ("c", False)]


# --- the command ---

def write(tmp_path, name, data):
    p = tmp_path / name
    p.write_bytes(data if isinstance(data, bytes) else json.dumps(data).encode())
    return p


def cli(tmp_path, track_out, passes_out, source="synthetic", points=None, events=None, repo=None, gpx_bytes=None):
    track = points if points is not None else walk(121, start=T0 + 60_000)
    runs = events if events is not None else [report("r1", "T1", "device-2", track[30][0], track[30][1] + 50 / DEG_LAT_M, track[30][2])]
    args = ["--gpx", str(write(tmp_path, "t.gpx", gpx_bytes if gpx_bytes is not None else gpx(track))), "--grid", str(write(tmp_path, "g.json", GRID)),
            "--run", str(write(tmp_path, "run.json", run_file(runs, [{"deviceId": "device-2", "teamId": "T1", "clockOffsetMs": 0}]))), "--from", it.iso_utc(T0), "--to", it.iso_utc(T0 + 3_600_000),
            "--source", source, "--track-out", str(track_out), "--passes-out", str(passes_out)]
    # A stand-in repository root inside the test folder, so no test writes into the real repository.
    return it.main(args, repo_root=repo if repo is not None else tmp_path / "repo")


def test_writes_the_track_locally_and_a_passes_file_with_no_coordinate_in_it(tmp_path):
    track_out = tmp_path / "tracks.local" / "drill.track.json"
    passes_out = tmp_path / "passes" / "drill-test-2026-11-22.passes.json"
    assert cli(tmp_path, track_out, passes_out) == 0
    track = json.loads(track_out.read_text())
    assert track["source"] == "synthetic" and track["gridId"] == "kennesaw-mountain-drill" and len(track["points"]) == 121
    passes = json.loads(passes_out.read_text())
    assert passes["runId"] == "drill-test-2026-11-22" and passes["source"] == "synthetic" and passes["basis"] == "reports"
    assert passes["passes"] == [{"teamId": "T1", "eventId": "r1", "distanceM": 50, "atMs": T0 + 60_000 + 150_000, "accuracyM": 8.0, "clockChecked": True}]
    assert track["breaks"] == []
    text = passes_out.read_text()
    assert '"lat"' not in text and '"lon"' not in text and str(round(LAT0, 2)) not in text


def test_the_track_is_written_only_inside_a_local_folder(tmp_path):
    assert cli(tmp_path, tmp_path / "public" / "drill.track.json", tmp_path / "p.json") == 2
    assert not (tmp_path / "public" / "drill.track.json").exists()


def test_the_track_is_never_written_inside_the_repository_even_in_a_local_folder(tmp_path):
    # Inside the repository a .local folder can still be served (web/public, web/dist) or read by the dev server.
    repo = tmp_path / "repo"
    for inside in (repo / "web" / "public" / "extras" / "tracks.local" / "t.json", repo / "tools" / "extras" / "tracks.local" / "t.json",
                   repo / "WEB" / "Public" / "x.local" / "t.json"):
        assert cli(tmp_path, inside, tmp_path / "p.json", repo=repo) == 2, inside
        assert not inside.exists()


def test_a_symlinked_track_path_or_local_folder_cannot_point_the_write_into_the_repository(tmp_path):
    repo = tmp_path / "repo"
    (repo / "web" / "public").mkdir(parents=True)
    victim = repo / "web" / "public" / "published-run.json"
    victim.write_text("tracked")
    # A .local folder outside that is a link into the repository.
    (tmp_path / "linked.local").symlink_to(repo / "web" / "public", target_is_directory=True)
    assert cli(tmp_path, tmp_path / "linked.local" / "t.json", tmp_path / "p.json", repo=repo) == 2
    # A track path that is itself a link to a tracked file.
    (tmp_path / "out.local").mkdir()
    (tmp_path / "out.local" / "t.json").symlink_to(victim)
    assert cli(tmp_path, tmp_path / "out.local" / "t.json", tmp_path / "p.json", repo=repo) == 2
    assert victim.read_text() == "tracked"


def test_a_stale_temporary_link_beside_the_track_is_never_followed(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    victim = tmp_path / "victim.json"
    victim.write_text("keep")
    out = tmp_path / "out.local" / "t.json"
    out.parent.mkdir()
    (out.parent / "t.json.tmp").symlink_to(victim)
    assert cli(tmp_path, out, tmp_path / "p.json", repo=repo) == 0
    assert victim.read_text() == "keep"
    assert json.loads(out.read_text())["source"] == "synthetic"


def test_a_local_folder_inside_the_repository_that_links_outside_is_refused_too(tmp_path):
    # Written through web/public, the track would be served there, wherever the link points.
    repo = tmp_path / "repo"
    (repo / "web" / "public").mkdir(parents=True)
    private = tmp_path / "private.local"
    private.mkdir()
    (repo / "web" / "public" / "tracks.local").symlink_to(private, target_is_directory=True)
    assert cli(tmp_path, repo / "web" / "public" / "tracks.local" / "t.json", tmp_path / "p.json", repo=repo) == 2
    assert list(private.iterdir()) == []


def test_refuses_a_gpx_file_holding_a_nul_byte_so_a_utf_16_file_with_no_byte_order_mark_cannot_hide_a_doctype():
    utf16 = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE gpx><gpx xmlns="x"/>'.encode("utf-16-le")
    with pytest.raises(ValueError, match="not UTF-8"):
        it.parse_gpx(utf16)


def test_the_passes_file_spans_every_kept_point_so_a_report_at_the_last_fix_is_inside_it(tmp_path):
    pts = [(T0 + 60_000, LAT0, LON0), (T0 + 65_000, LAT0, LON0), (T0 + 67_000, LAT0, LON0)]
    runs = [report("r1", "T1", "device-2", T0 + 67_000, LAT0, LON0)]
    passes_out = tmp_path / "p.json"
    assert cli(tmp_path, tmp_path / "out.local" / "t.json", passes_out, points=pts, events=runs) == 0
    f = json.loads(passes_out.read_text())
    assert (f["trackFromMs"], f["trackToMs"]) == (T0 + 60_000, T0 + 67_000)
    assert f["passes"][0]["atMs"] == T0 + 67_000


def test_the_repository_reached_by_another_name_is_still_the_repository(tmp_path):
    # Another name for the same folder (a link here; on a Mac also /System/Volumes/Data/...) must not pass the check:
    # the check compares folders, not the strings that name them.
    repo = tmp_path / "repo"
    (repo / "web" / "public").mkdir(parents=True)
    alias = tmp_path / "alias"
    alias.symlink_to(repo, target_is_directory=True)
    for written in (alias / "web" / "public" / "x.local" / "t.json", alias / "WEB" / "public" / "x.local" / "t.json"):
        assert it._inside_repository(written, repo), written
    assert not it._inside_repository(tmp_path / "elsewhere.local" / "t.json", repo)
    assert cli(tmp_path, alias / "web" / "public" / "x.local" / "t.json", tmp_path / "p.json", repo=repo) == 2
    assert not (repo / "web" / "public" / "x.local").exists()


def test_a_synthetic_passes_file_is_never_written_inside_the_repository(tmp_path):
    repo = tmp_path / "repo"
    for served in (repo / "web" / "public" / "extras" / "passes" / "x.passes.json", repo / "web" / "dist" / "x.passes.json",
                   repo / "WEB" / "PUBLIC" / "x.passes.json"):
        assert cli(tmp_path, tmp_path / "tracks.local" / "t.json", served, source="synthetic", repo=repo) == 2, served
        assert not served.exists()


def test_refuses_a_gpx_file_that_is_not_utf_8_so_a_utf_16_doctype_cannot_hide(tmp_path):
    utf16 = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE gpx [<!ENTITY s "x">]><gpx xmlns="x"/>'.encode("utf-16")
    with pytest.raises(ValueError, match="not UTF-8"):
        it.parse_gpx(utf16)


def test_a_gpx_file_over_the_size_limit_is_refused_before_it_is_read(tmp_path, monkeypatch):
    monkeypatch.setattr(it, "MAX_GPX_BYTES", 100)
    track_out = tmp_path / "tracks.local" / "t.json"
    assert cli(tmp_path, track_out, tmp_path / "p.json") == 1
    assert not track_out.exists()


def test_a_refused_track_writes_neither_file(tmp_path):
    bad = walk(3, start=T0 + 60_000) + [(T0 + 75_000, LAT0 + 900 / DEG_LAT_M, LON0)]
    track_out, passes_out = tmp_path / "tracks.local" / "t.json", tmp_path / "p.json"
    assert cli(tmp_path, track_out, passes_out, points=bad, events=[]) == 1
    assert not track_out.exists() and not passes_out.exists()


def test_the_summary_accounts_for_every_point_read(tmp_path, capsys):
    pts = walk(31, step_s=1, start=T0 + 60_000)  # 31 points 1 s apart: 7 kept after thinning to one per 5 s
    assert cli(tmp_path, tmp_path / "tracks.local" / "t.json", tmp_path / "p.json", points=pts, events=[]) == 0
    out = capsys.readouterr().out
    assert "kept 7 of 31 points (0 outside the drill area, 0 outside the window, 24 thinned to one per 5 s)" in out
