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


def sample_segments() -> tuple[dict[str, dict], int]:
    """Real segment docs (the shape the apps decode), with the prior scaled to sum to 1."""
    import json
    docs = json.loads((ROOT / "shared/test-vectors/pack-segments-sample.json").read_text())["segments"]
    segs = {d["id"]: copy.deepcopy(d["fields"]) for d in docs}
    total = sum(jd.pack.plain(f["priorPoa"]) for f in segs.values())
    for f in segs.values():
        f["priorPoa"] = {"doubleValue": jd.pack.plain(f["priorPoa"]) / total}
    return segs, jd.pack.plain(next(iter(segs.values()))["priorVersion"])


def raw_seed() -> dict:
    segs, v = sample_segments()
    plan = lambda n, by: {"version": I(n), "priorVersion": I(v), "approvedByUid": S(by), "basedOnEventSetHash": S("h"),
                          "createdClientTimeMs": I(1), "approvedAt": {"timestampValue": "2026-11-19T12:19:47.626Z"},
                          "assignments": {"arrayValue": {"values": []}}}
    return {
        "incident": {"name": S("Seed"), "mode": S("drill"), "drillLabel": S("x"), "status": S("open"), "gridId": S("piedmont-park-dev"),
                     "priorVersion": I(v), "createdAt": {"timestampValue": "2026-11-17T00:00:00Z"}, "joinCodeHash": S("h"),
                     "searchState": S("searching"), "priorInputEventIds": {"arrayValue": {"values": [S("e1")]}}},
        "segments": segs,
        "plans": {"0018": plan(18, "push-test"), "0017": plan(17, "real")},
        "teams": {"T1": {"teamId": S("T1"), "name": S("Team 1"), "colorSlot": I(1), "createdAt": {"timestampValue": "2026-11-17T00:00:00Z"}}},
        "shared": {"answersTo": S("Mae")},
    }


class FakeApi:
    """Records every write and delete in order; a media delete can answer 404 (already gone)."""
    def __init__(self, extra_docs: list[str], media: list[str], gone: set[str] = frozenset()):
        self.log: list[tuple[str, str]] = []
        self.extra, self.files, self.gone = extra_docs, media, gone

    def all_docs(self, path):
        return [f"{path}/{p}" for p in self.extra]

    def media(self, drill):
        return list(self.files)

    def commit(self, writes):
        for w in writes:
            self.log.append(("delete", w["delete"]) if "delete" in w else ("write", w["update"]["name"]))

    def delete_media(self, name):
        self.log.append(("media", name))
        return name not in self.gone


def test_the_baseline_is_the_seed_with_the_drill_overrides():
    b = jd.baseline(raw_seed(), TS)
    inc = b[""]
    assert inc["mode"] == S("drill") and inc["status"] == S("open") and inc["drillLabel"] == S(jd.seed_drill.DRILL_LABEL)
    assert inc["name"] == S(jd.NAME) and "Judge drill" in jd.NAME and "nobody is missing" in jd.NAME
    assert inc["priorInputEventIds"] == {"arrayValue": {}}
    assert not {"createdAt", "joinCodeHash"} & set(inc)
    assert inc["gridId"] == S("piedmont-park-dev") and inc["searchState"] == S("searching")
    assert set(b) == {"", "profile/shared", "plans/0017", "teams/T1"} | {f"segments/{k}" for k in sample_segments()[0]}
    assert b["plans/0017"]["approvedByUid"] == S(jd.BASELINE_APPROVER), "the test plan is skipped and no uid ships"
    assert b["plans/0017"]["approvedAt"] == {"timestampValue": "2026-11-19T12:19:47.626Z"}, "values keep their Firestore types"


def test_the_check_catches_drift_and_ignores_the_incidents_own_extra_fields():
    want = jd.baseline(raw_seed(), TS)
    have = copy.deepcopy(want)
    have[""] = {**have[""], "createdAt": {"timestampValue": "2026-11-20T00:00:00Z"}}
    assert jd.differences(want, have) == []
    spoiled = copy.deepcopy(have)
    seg = next(k for k in want if k.startswith("segments/") and k != "segments/ROW")
    spoiled[seg]["priorPoa"] = {"doubleValue": 0.9}
    spoiled[""]["status"] = S("closed")
    del spoiled["teams/T1"]
    found = jd.differences(want, spoiled)
    assert any(f.startswith(seg) for f in found)
    assert any(f.startswith("incident: differs") and "status" in f for f in found)
    assert "teams/T1: missing" in found


def test_the_check_fails_a_stale_higher_plan_or_a_stale_incident_field():
    # The iPhone reads the highest plan version and the incident's conditions, so leftovers count as drift.
    want = jd.baseline(raw_seed(), TS)
    have = copy.deepcopy(want)
    have["plans/0020"] = {"version": I(20)}
    assert any(f.startswith("plans/0020") for f in jd.differences(want, have))
    have = copy.deepcopy(want)
    have[""]["conditions"] = {"mapValue": {}}
    assert any("conditions" in f for f in jd.differences(want, have))
    assert "conditions" in jd.incident_mask(want[""]), "--write clears an incident field the seed no longer has"


def test_an_incomplete_seed_is_refused_before_anything_is_written():
    import pytest
    for spoil in (lambda s: s["segments"].pop("ROW"), lambda s: s.__setitem__("shared", None),
                  lambda s: s["segments"][next(iter(s["segments"]))].__setitem__("priorPoa", {"doubleValue": 5.0})):
        seed = raw_seed()
        spoil(seed)
        with pytest.raises(ValueError):
            jd.baseline(seed, TS)


def test_the_reset_writes_the_baseline_before_it_deletes_and_takes_a_missing_file_as_gone():
    want = jd.baseline(raw_seed(), TS)
    api = FakeApi(extra_docs=["events/e1", "clipReadings/c1", "plans/0020"], media=["clips/drill-judge-1/c1.mp4"],
                  gone={"clips/drill-judge-1/c1.mp4"})
    deleted_docs, deleted_media = jd.run_reset(api, want)
    kinds = [k for k, _ in api.log]
    assert kinds.index("delete") > max(i for i, k in enumerate(kinds) if k == "write"), "baseline first"
    assert deleted_docs == 3 and deleted_media == 1
    assert not any(n.endswith("/plans/0017") for k, n in api.log if k == "delete"), "the baseline plan is never deleted"


def test_doc_paths_are_quoted_so_a_hash_stays_in_the_path():
    assert "#" not in jd.doc_url("incidents/drill-judge-1/events/a#b")
    assert jd.doc_url("incidents/drill-judge-1/events/a#b").endswith("/events/a%23b")


def test_the_reset_refuses_another_drill_and_the_judging_days():
    assert jd.reset_refused(datetime.date(2026, 11, 25), jd.DRILL) is None
    assert jd.reset_refused(datetime.date(2026, 11, 25), "drill-dev-1") is not None
    for day in (datetime.date(2026, 12, 10), datetime.date(2026, 12, 13), datetime.date(2026, 12, 16)):
        assert "judging" in jd.reset_refused(day, jd.DRILL)
    assert jd.reset_refused(datetime.date(2026, 12, 17), jd.DRILL) is None


def test_unknown_arguments_change_nothing():
    for argv in ([], ["--yes"], ["--reset", "--force"], ["--write", "drill-dev-1"]):
        assert jd.main(argv) == 2
