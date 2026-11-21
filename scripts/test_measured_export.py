"""measured_export: the judge page's Measured block is computed from stored data and written to a committed file."""

import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("me", Path(__file__).with_name("measured_export.py"))
me = importlib.util.module_from_spec(spec)
spec.loader.exec_module(me)

ROOT = Path(__file__).resolve().parents[1]


def route(path, ms, platform="web", at=1795200000000):
    return {"path": path, "latencyMs": ms, "platform": platform, "decidedAtMs": at}


def test_median_of_odd_and_even_counts_and_none_for_empty():
    assert me.median([5, 1, 3]) == 3
    assert me.median([4, 1, 3, 2]) == 2.5
    assert me.median([]) is None


def test_reads_are_counted_once_per_event_even_when_a_sandbox_copied_the_event():
    rows = [("e1", route("on_device", 900)), ("e1", route("on_device", 900)), ("e2", route("cloud", 2000)),
            ("e3", route("cloud", 1000)), ("e4", route("rules", 2)), ("e5", route("unknown", 0)), ("e6", None)]
    a = me.aggregate(rows)
    assert a["reads"] == 5
    assert a["onDevice"] == {"count": 1, "medianMs": 900}
    assert a["cloud"] == {"count": 2, "medianMs": 1500}
    assert a["rules"] == 1 and a["unknown"] == 1
    assert a["onDeviceShare"] == 0.33
    assert a["byPlatform"]["web"] == {"onDevice": 1, "cloud": 2, "rules": 1}


def test_plan_wording_routes_are_counted_once_per_route_record_since_plan_ids_repeat_across_incidents():
    w1, w2 = route("on_device", 3000, at=1795200000000), route("cloud", 1800, at=1795200100000)
    a = me.aggregate([(me.route_key(w1), w1), (me.route_key(dict(w1)), dict(w1)), (me.route_key(w2), w2)])
    assert a["onDevice"] == {"count": 1, "medianMs": 3000} and a["cloud"] == {"count": 1, "medianMs": 1800}
    assert a["onDeviceShare"] == 0.5


def test_the_window_is_the_first_and_last_decided_time():
    rows = [("a", route("cloud", 10, at=1795200000000)), ("b", route("on_device", 10, at=1795300000000))]
    assert me.window(rows) == {"from": "2026-11-20T18:40:00Z", "to": "2026-11-21T22:26:40Z"}


def test_no_model_reads_give_no_share():
    a = me.aggregate([("e1", route("rules", 1))])
    assert a["onDeviceShare"] is None and a["onDevice"] == {"count": 0, "medianMs": None}


def test_a_file_built_from_the_parts_passes_its_own_check():
    now = datetime(2026, 11, 21, 5, 0, tzinfo=timezone.utc)
    a = me.aggregate([("e1", route("on_device", 900)), ("e2", route("cloud", 2000))])
    spend = {"from": "2026-11-13", "to": "2026-11-21T05:00Z", "usd": 0.21, "days": 8, "usdPerDay": 0.0263}
    f = me.build(a, me.window([("e1", route("cloud", 1))]), a, me.window([]), spend, now)
    assert f["generatedAt"] == "2026-11-21T05:00:00Z"
    assert "route records" in f["source"]["reads"] and "wordingRoute" in f["source"]["wording"] and "ai_spend" in f["source"]["spend"]
    assert me.check(f) == []


def test_the_check_refuses_a_file_with_a_missing_or_typed_number():
    now = datetime(2026, 11, 21, 5, 0, tzinfo=timezone.utc)
    agg = me.aggregate([("e1", route("cloud", 1))])
    good = me.build(agg, {"from": "a", "to": "b"}, agg, {"from": "a", "to": "b"},
                    {"from": "2026-11-13", "to": "x", "usd": 0.1, "days": 8, "usdPerDay": 0.0125}, now)
    assert me.check({**good, "generatedAt": "yesterday"})
    assert me.check({**good, "reads": {**good["reads"], "reads": "12"}})
    assert me.check({k: v for k, v in good.items() if k != "spend"})
    assert me.check({k: v for k, v in good.items() if k != "wording"})


def test_the_committed_file_passes_the_check():
    f = json.loads((ROOT / "web/public/evidence/measured.json").read_text())
    assert me.check(f) == [], me.check(f)
