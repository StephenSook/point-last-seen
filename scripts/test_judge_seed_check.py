"""Tests for scripts/judge_seed_check.py: the drill every judge practice search is copied from must match the
committed baseline, and a read that fails is never a pass. No network: the reads are injected."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import judge_seed_check as jsc  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TS = 'export const JUDGE_SEED_INCIDENT = "drill-x";\nconst NOT_COPIED = new Set(["createdAt", "name",\n  "status"]);\n'


def s(v):
    return {"stringValue": v}


def doc(path, **fields):
    return {"name": f"projects/p/databases/(default)/documents/{path}", "fields": fields}


def world(**over):
    w = {
        "incidents/drill-x": doc("incidents/drill-x", name=s("Dev"), status=s("open"), gridId=s("g"),
                                 ipp={"mapValue": {"fields": {"lat": {"doubleValue": 33.7}, "lon": {"doubleValue": -84.3}}}},
                                 priorVersion={"integerValue": "5"}, priorInputEventIds={"arrayValue": {}}),
        "incidents/drill-x/profile/shared": doc("incidents/drill-x/profile/shared", answersTo=s("Drill subject"),
                                                clothingLastWorn=s("blue coat"), flags={"mapValue": {"fields": {"mayNotRespond": {"booleanValue": True}}}}),
        "incidents/drill-x/teams": [doc("incidents/drill-x/teams/T1", teamId=s("T1")), doc("incidents/drill-x/teams/T2", teamId=s("T2"))],
        "incidents/drill-x/segments": [doc("incidents/drill-x/segments/AA", priorPoa={"doubleValue": 0.4}),
                                       doc("incidents/drill-x/segments/ROW", priorPoa={"doubleValue": 0.1})],
        "incidents/drill-x/events": [doc("incidents/drill-x/events/e1"), doc("incidents/drill-x/events/e2")],
    }
    w.update(over)
    return w


def fetcher(w):
    def fetch(path):
        if path not in w:
            raise jsc.ReadError(f"no {path}")
        return w[path]
    return fetch


def test_the_seed_id_and_the_fields_a_copy_skips_come_from_the_function_source():
    assert jsc.seed_constants(TS) == ("drill-x", {"createdAt", "name", "status"})
    seed, skipped = jsc.seed_constants((ROOT / "functions/src/judgeSession.ts").read_text())
    assert seed and "expiresAt" in skipped and "setupReady" in skipped
    for broken in ("", 'const NOT_COPIED = new Set(["a"]);', 'export const JUDGE_SEED_INCIDENT = "x";'):
        try:
            jsc.seed_constants(broken)
        except ValueError:
            continue
        raise AssertionError(f"accepted {broken!r}")


def test_values_are_read_as_plain_json():
    assert jsc.plain({"integerValue": "5"}) == 5 and jsc.plain({"doubleValue": 0.5}) == 0.5
    assert jsc.plain({"nullValue": None}) is None and jsc.plain({"booleanValue": False}) is False
    assert jsc.plain({"timestampValue": "2026-11-19T00:00:00Z"}) == "2026-11-19T00:00:00Z"
    assert jsc.plain({"arrayValue": {}}) == [] and jsc.plain({"mapValue": {}}) == {}
    assert jsc.plain({"mapValue": {"fields": {"a": {"arrayValue": {"values": [s("x")]}}}}}) == {"a": ["x"]}


def test_the_snapshot_holds_what_a_copy_reads_and_hashes_the_rest_in_any_order():
    snap = jsc.snapshot(fetcher(world()), "drill-x", {"createdAt", "name", "status"})
    assert snap["incident"] == {"gridId": "g", "ipp": {"lat": 33.7, "lon": -84.3}, "priorVersion": 5, "priorInputEventIds": []}
    assert snap["profileShared"]["clothingLastWorn"] == "blue coat"
    assert snap["teams"] == {"T1": {"teamId": "T1"}, "T2": {"teamId": "T2"}}
    assert snap["segments"]["count"] == 2 and snap["events"]["count"] == 2
    w = world()
    w["incidents/drill-x/segments"] = list(reversed(w["incidents/drill-x/segments"]))
    w["incidents/drill-x/events"] = list(reversed(w["incidents/drill-x/events"]))
    again = jsc.snapshot(fetcher(w), "drill-x", {"createdAt", "name", "status"})
    assert again == snap


def test_a_change_anywhere_is_named():
    base = jsc.snapshot(fetcher(world()), "drill-x", {"createdAt", "name", "status"})
    assert jsc.diff(base, base) == []
    w = world()
    w["incidents/drill-x/profile/shared"]["fields"]["clothingLastWorn"] = s("drill coat 6455")
    w["incidents/drill-x/profile/shared"]["fields"]["trackingAids"] = {"mapValue": {"fields": {"note": s("")}}}
    w["incidents/drill-x/events"] = w["incidents/drill-x/events"] + [doc("incidents/drill-x/events/e3")]
    w["incidents/drill-x/segments"][0]["fields"]["priorPoa"] = {"doubleValue": 0.5}
    lines = "\n".join(jsc.diff(base, jsc.snapshot(fetcher(w), "drill-x", {"createdAt", "name", "status"})))
    assert "profile/shared.clothingLastWorn" in lines and "profile/shared.trackingAids" in lines
    assert "events: 2 -> 3" in lines and "segments" in lines


def test_the_run_passes_on_a_match_fails_on_drift_and_never_passes_a_failed_read(tmp_path):
    baseline = tmp_path / "baseline.json"
    assert jsc.run(fetcher(world()), TS, baseline, write=True) == 0
    assert json.loads(baseline.read_text())["seed"] == "drill-x"
    assert jsc.run(fetcher(world()), TS, baseline, write=False) == 0
    w = world()
    w["incidents/drill-x/profile/shared"]["fields"]["answersTo"] = s("someone else")
    assert jsc.run(fetcher(w), TS, baseline, write=False) == 1
    del w["incidents/drill-x/profile/shared"]
    assert jsc.run(fetcher(w), TS, baseline, write=False) == 2
    assert jsc.run(fetcher(world()), TS, tmp_path / "absent.json", write=False) == 2


def test_the_committed_baseline_is_for_the_judge_seed_the_function_names():
    seed, _ = jsc.seed_constants((ROOT / "functions/src/judgeSession.ts").read_text())
    committed = json.loads((ROOT / "scripts/judge_seed_baseline.json").read_text())
    assert committed["seed"] == seed
    assert committed["profileShared"].get("clothingLastWorn") == "blue coat" and "trackingAids" not in committed["profileShared"]
