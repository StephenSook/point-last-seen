"""The iPhone practice pack: the committed file passes, and the check catches what must never ship."""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/practice"))
import export_practice_pack as ep  # noqa: E402

TS = ep.JUDGE_TS.read_text()
SEED = json.loads(ep.SEED_FILE.read_text())["incidentId"]


def sample_segments() -> dict[str, dict]:
    docs = json.loads((ROOT / "shared/test-vectors/pack-segments-sample.json").read_text())["segments"]
    return {d["id"]: {k: ep.plain(v) for k, v in d["fields"].items()} for d in docs}


def sample_pack() -> dict:
    segs = sample_segments()
    version = next(iter(segs.values()))["priorVersion"]
    total = sum(s["priorPoa"] for s in segs.values())
    for s in segs.values():
        s["priorPoa"] = s["priorPoa"] / total
    ids = [k for k in segs if k != "ROW"]
    incident = {"name": "Seed", "mode": "drill", "drillLabel": "x", "status": "open", "gridId": "piedmont-park-dev",
                "gridAttribution": "OpenStreetMap", "priorVersion": version, "engineParams": {"a": 1},
                "priorInputEventIds": ["e1"], "createdAt": 1, "joinCodeHash": "h", "setupReady": True}
    plan = lambda v, by: {"version": v, "priorVersion": version, "basedOnEventSetHash": "h", "createdClientTimeMs": 5,
                          "approvedByUid": by, "approvedAt": 6,
                          "assignments": [{"teamId": "T1", "segmentIds": [ids[0]], "taskText": "Search.", "reason": "POA."},
                                          {"teamId": "T2", "segmentIds": [ids[1]], "taskText": "Search.", "reason": "POA."}]}
    plans = {"0001": plan(1, "real-uid"), "0002": plan(2, "push-test")}
    shared = {"answersTo": "Mae", "nickname": "", "gender": "female"}
    return ep.build(SEED, incident, segs, plans, shared, TS, "abc1234", "2026-11-20T00:00:00Z")


def test_judge_rules_are_read_from_the_function_source():
    not_copied, label = ep.judge_rules(TS)
    assert {"joinCodeHash", "setupReady", "createdAt", "expiresAt"} <= not_copied
    assert label.startswith("Training drill.")


def test_build_applies_the_practice_overrides_and_drops_what_must_not_ship():
    p = sample_pack()
    assert ep.problems(p, SEED, TS) == []
    inc = p["incident"]
    assert inc["mode"] == "judge" and inc["status"] == "open" and inc["priorInputEventIds"] == []
    assert inc["name"] == "Practice search"
    assert not {"joinCodeHash", "setupReady", "createdAt"} & set(inc)
    assert p["plan"]["version"] == 1, "the test plan (push-test) is never picked"
    assert p["plan"]["approvedByUid"] == ep.APPROVER
    assert p["incidentId"] == SEED and p["teamId"] == "T1"


def test_the_check_catches_what_must_never_ship():
    base = sample_pack()
    cases = {
        "uid field": lambda p: p["sharedProfile"].__setitem__("createdByUid", "u1"),
        "join code": lambda p: p["incident"].__setitem__("joinCodeHash", "h"),
        "real approver": lambda p: p["plan"].__setitem__("approvedByUid", "real-uid"),
        "no T1 assignment": lambda p: p["plan"].__setitem__("assignments", p["plan"]["assignments"][1:]),
        "unknown segment": lambda p: p["plan"]["assignments"][0].__setitem__("segmentIds", ["ZZ"]),
        "not judge mode": lambda p: p["incident"].__setitem__("mode", "drill"),
        "profile field": lambda p: p["sharedProfile"].__setitem__("familyPhone", "x"),
        "wrong seed": lambda p: p.__setitem__("incidentId", "drill-test-1"),
        "segment contract": lambda p: p["segments"][0].pop("geometryJson"),
        "too big": lambda p: p["sharedProfile"].__setitem__("uniqueDescription", "x" * ep.MAX_BYTES),
    }
    for name, spoil in cases.items():
        p = copy.deepcopy(base)
        spoil(p)
        assert ep.problems(p, SEED, TS) != [], name


def test_timestamps_become_epoch_milliseconds():
    assert ep.plain({"timestampValue": "2026-11-19T12:19:47.626Z"}) == 1795090787626


def test_the_committed_pack_passes():
    assert ep.PACK.exists()
    assert ep.problems(json.loads(ep.PACK.read_text()), SEED, TS) == []
