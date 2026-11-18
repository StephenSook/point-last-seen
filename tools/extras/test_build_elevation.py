"""Tests for tools/extras/build_elevation.py (a fake fetch; no network)."""

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("build_elevation", Path(__file__).with_name("build_elevation.py"))
be = importlib.util.module_from_spec(spec)
spec.loader.exec_module(be)


def square(segment_id, west, south, d=0.001):
    ring = [[west, south], [west + d, south], [west + d, south + d], [west, south + d], [west, south]]
    return {"segmentId": segment_id, "centroid": {"lat": south + d / 2, "lon": west + d / 2},
            "geometry": {"type": "Polygon", "coordinates": [ring]}, "downstream": []}


# FIXTURE: a made-up two-cell grid, not a real site.
GRID = {"gridId": "fixture-grid", "segments": [square("AA", -84.37, 33.78), square("AB", -84.369, 33.78)]}


def epqs(value):
    return json.dumps({"locationId": 0, "value": value, "rasterId": 1, "resolution": 1}).encode()


class FakeFetch:
    def __init__(self, heights):
        self.heights = heights
        self.calls = []

    def __call__(self, lat, lon):
        self.calls.append((lat, lon))
        return epqs(self.heights(lat, lon))


def test_five_points_all_inside_the_cell():
    cell = GRID["segments"][0]
    pts = be.sample_points(cell)
    assert len(pts) == 5
    assert pts[0] == (cell["centroid"]["lat"], cell["centroid"]["lon"])
    for lat, lon in pts:
        assert -84.37 < lon < -84.369 and 33.78 < lat < 33.781


def test_a_clipped_cell_keeps_only_points_inside_it():
    # An L shape: the north-east quarter of the square is cut away.
    w, s, d = -84.37, 33.78, 0.001
    ring = [[w, s], [w + d, s], [w + d, s + d / 2], [w + d / 2, s + d / 2], [w + d / 2, s + d], [w, s + d], [w, s]]
    cell = {"segmentId": "L", "centroid": {"lat": s + 0.0004, "lon": w + 0.0004}, "geometry": {"type": "Polygon", "coordinates": [ring]}}
    pts = be.sample_points(cell)
    assert len(pts) == 4
    assert all(not (lon > w + d / 2 and lat > s + d / 2) for lat, lon in pts)


def test_parse_reads_the_value_in_metres_even_as_a_string():
    assert be.parse_epqs(epqs("258.837890625")) == pytest.approx(258.837890625)
    assert be.parse_epqs(epqs(12.5)) == 12.5


def test_parse_refuses_html_served_with_status_200():
    with pytest.raises(ValueError):
        be.parse_epqs(b"<!doctype html><html><body>Request blocked</body></html>")
    with pytest.raises(ValueError):
        be.parse_epqs(json.dumps({"locationId": 0}).encode())


@pytest.mark.parametrize("value", [-1000000, -501, 9001, "nan", None])
def test_parse_refuses_values_out_of_range(value):
    with pytest.raises(ValueError):
        be.parse_epqs(epqs(value))


def test_cell_mean_min_max():
    fetch = FakeFetch(lambda lat, lon: 100 + (lat - 33.78) * 10_000)
    out = be.build(GRID, fetch, lambda s: None, "2026-11-18")
    aa = out["cells"]["AA"]
    assert aa["n"] == 5
    assert aa["minM"] == pytest.approx(102.5, abs=0.01)
    assert aa["maxM"] == pytest.approx(107.5, abs=0.01)
    assert aa["meanM"] == pytest.approx(105.0, abs=0.01)


def test_requests_are_paced():
    slept = []
    fetch = FakeFetch(lambda lat, lon: 200)
    be.build(GRID, fetch, slept.append, "2026-11-18", pace_s=1.5)
    assert len(fetch.calls) == 10
    assert len(slept) == len(fetch.calls) - 1
    assert all(s >= 1.5 for s in slept)


def test_output_names_source_license_credit_and_date():
    out = be.build(GRID, FakeFetch(lambda lat, lon: 200), lambda s: None, "2026-11-18")
    grid_bytes = json.dumps(GRID).encode()
    assert out["gridId"] == "fixture-grid"
    assert out["source"] == "USGS 3DEP via the Elevation Point Query Service"
    assert out["license"] == "US public domain"
    assert out["credit"] == "U.S. Geological Survey"
    assert out["fetchedAt"] == "2026-11-18"
    assert out["samplesPerCell"] == 5
    assert out["units"] == "metres"
    assert set(out["cells"]) == {"AA", "AB"}
    assert out["gridSha256"] == "" or len(out["gridSha256"]) == 64
    assert be.with_grid_hash(out, grid_bytes)["gridSha256"] == hashlib.sha256(grid_bytes).hexdigest()


def test_one_failed_fetch_writes_no_file(tmp_path):
    grid = tmp_path / "g.grid.json"
    grid.write_text(json.dumps(GRID))
    out = tmp_path / "terrain" / "g.elevation.json"
    calls = []

    def flaky(lat, lon):
        calls.append(1)
        if len(calls) == 7:
            return b"<html>blocked</html>"
        return epqs(200)

    assert be.main(["--grid", str(grid), "--out", str(out)], fetch=flaky, sleep=lambda s: None) == 1
    assert not out.exists()
    assert len(calls) == 7  # it stops at the failure; it never retries


def test_check_fails_when_the_grid_hash_differs():
    grid_bytes = json.dumps(GRID).encode()
    out = be.with_grid_hash(be.build(GRID, FakeFetch(lambda lat, lon: 200), lambda s: None, "2026-11-18"), grid_bytes)
    assert be.check(grid_bytes, out) == []
    assert be.check(grid_bytes + b" ", out) == ["the grid changed since the elevation file was built"]


def test_check_fails_when_a_cell_is_missing():
    grid_bytes = json.dumps(GRID).encode()
    out = be.with_grid_hash(be.build(GRID, FakeFetch(lambda lat, lon: 200), lambda s: None, "2026-11-18"), grid_bytes)
    del out["cells"]["AB"]
    assert be.check(grid_bytes, out) == ["cell AB has no elevation"]


def test_main_writes_then_checks(tmp_path):
    grid = tmp_path / "g.grid.json"
    grid.write_text(json.dumps(GRID))
    out = tmp_path / "terrain" / "g.elevation.json"
    assert be.main(["--grid", str(grid), "--out", str(out), "--check"]) == 1  # missing
    assert be.main(["--grid", str(grid), "--out", str(out)], fetch=FakeFetch(lambda lat, lon: 200), sleep=lambda s: None, today="2026-11-18") == 0
    assert be.main(["--grid", str(grid), "--out", str(out), "--check"]) == 0
    data = json.loads(out.read_text())
    assert data["gridSha256"] == hashlib.sha256(grid.read_bytes()).hexdigest()
