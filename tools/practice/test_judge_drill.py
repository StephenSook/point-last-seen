"""The judge drill's baseline is the judge seed's story, its check catches drift, and its reset refuses the wrong time."""
import copy
import datetime
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/practice"))
import judge_drill as jd  # noqa: E402

TS = jd.pack.JUDGE_TS.read_text()
S = lambda v: {"stringValue": v}
I = lambda v: {"integerValue": str(v)}


def raw_seed() -> dict:
    plan = lambda v, by: {"version": I(v), "priorVersion": I(5), "approvedByUid": S(by), "basedOnEventSetHash": S("h"),
                          "createdClientTimeMs": I(1), "approvedAt": {"timestampValue": "2026-11-19T12:19:47.626Z"},
                          "assignments": {"arrayValue": {"values": []}}}
    return {
        "incident": {"name": S("Seed"), "mode": S("drill"), "drillLabel": S("x"), "status": S("open"), "gridId": S("piedmont-park-dev"),
                     "priorVersion": I(5), "createdAt": {"timestampValue": "2026-11-17T00:00:00Z"}, "joinCodeHash": S("h"),
                     "searchState": S("searching"), "priorInputEventIds": {"arrayValue": {"values": [S("e1")]}}},
        "segments": {"BO": {"segmentId": S("BO"), "priorPoa": {"doubleValue": 0.5}}, "ROW": {"segmentId": S("ROW")}},
        "plans": {"0018": plan(18, "push-test"), "0017": plan(17, "real")},
        "teams": {"T1": {"teamId": S("T1"), "name": S("Team 1"), "colorSlot": I(1)}},
        "shared": {"answersTo": S("Mae")},
    }


def test_the_baseline_is_the_seed_with_the_drill_overrides():
    b = jd.baseline(raw_seed(), TS)
    inc = b[""]
    assert inc["mode"] == S("drill") and inc["status"] == S("open") and inc["drillLabel"] == S(jd.seed_drill.DRILL_LABEL)
    assert inc["name"] == S(jd.NAME) and "Judge drill" in jd.NAME and "nobody is missing" in jd.NAME
    assert inc["priorInputEventIds"] == {"arrayValue": {}}
    assert not {"createdAt", "joinCodeHash"} & set(inc)
    assert inc["gridId"] == S("piedmont-park-dev") and inc["searchState"] == S("searching")
    assert set(b) == {"", "profile/shared", "plans/0017", "segments/BO", "segments/ROW", "teams/T1"}
    assert b["plans/0017"]["approvedByUid"] == S(jd.BASELINE_APPROVER), "the test plan is skipped and no uid ships"
    assert b["plans/0017"]["approvedAt"] == {"timestampValue": "2026-11-19T12:19:47.626Z"}, "values keep their Firestore types"


def test_the_check_catches_drift_and_ignores_the_incidents_own_extra_fields():
    want = jd.baseline(raw_seed(), TS)
    have = copy.deepcopy(want)
    have[""] = {**have[""], "createdAt": {"timestampValue": "2026-11-20T00:00:00Z"}}
    assert jd.differences(want, have) == []
    spoiled = copy.deepcopy(have)
    spoiled["segments/BO"]["priorPoa"] = {"doubleValue": 0.9}
    spoiled[""]["status"] = S("closed")
    del spoiled["teams/T1"]
    found = jd.differences(want, spoiled)
    assert any(f.startswith("segments/BO") for f in found)
    assert any(f.startswith("incident: differs") and "status" in f for f in found)
    assert "teams/T1: missing" in found


def test_the_reset_refuses_another_drill_and_the_judging_days():
    assert jd.reset_refused(datetime.date(2026, 11, 25), jd.DRILL) is None
    assert jd.reset_refused(datetime.date(2026, 11, 25), "drill-dev-1") is not None
    for day in (datetime.date(2026, 12, 10), datetime.date(2026, 12, 13), datetime.date(2026, 12, 16)):
        assert "judging" in jd.reset_refused(day, jd.DRILL)
    assert jd.reset_refused(datetime.date(2026, 12, 17), jd.DRILL) is None


def test_unknown_arguments_change_nothing():
    for argv in ([], ["--yes"], ["--reset", "--force"], ["--write", "drill-dev-1"]):
        assert jd.main(argv) == 2
