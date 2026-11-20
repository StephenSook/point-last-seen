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
    seg = next(k for k in segs if k != "ROW")
    assign = {"mapValue": {"fields": {"teamId": S("T1"), "segmentIds": {"arrayValue": {"values": [S(seg)]}},
                                      "taskText": S("Search."), "reason": S("POA.")}}}
    plan = lambda n, by: {"version": I(n), "priorVersion": I(v), "approvedByUid": S(by), "basedOnEventSetHash": S("h"),
                          "createdClientTimeMs": I(1), "approvedAt": {"timestampValue": "2026-11-19T12:19:47.626Z"},
                          "assignments": {"arrayValue": {"values": [assign]}}}
    return {
        "incident": {"name": S("Seed"), "mode": S("drill"), "drillLabel": S("x"), "status": S("open"), "gridId": S("piedmont-park-dev"),
                     "gridAttribution": S("OpenStreetMap"), "engineParams": {"mapValue": {"fields": {"a": I(1)}}},
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
        self.commits = getattr(self, "commits", []) + [[("delete:" + w["delete"]) if "delete" in w else "write" for w in writes]]
        self.commits[-1] = [x.split(":", 1)[0] if x.startswith("delete:") else x for x in self.commits[-1]] + \
            [w["delete"] for w in writes if "delete" in w]
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


def test_a_seed_missing_a_planned_team_or_a_grid_field_is_refused():
    import pytest
    for spoil in (lambda s: s["teams"].pop("T1"), lambda s: s["incident"].pop("gridId"),
                  lambda s: s["incident"].pop("gridAttribution"), lambda s: s["incident"].pop("engineParams")):
        seed = raw_seed()
        spoil(seed)
        with pytest.raises(ValueError):
            jd.baseline(seed, TS)


def test_segment_numbers_must_be_stored_as_numbers_and_polygons_as_number_pairs():
    import json as _json
    import pytest
    seg = next(k for k in raw_seed()["segments"] if k != "ROW")
    seed = raw_seed()
    seed["segments"][seg]["areaM2"] = {"timestampValue": "2026-11-17T00:00:00Z"}
    with pytest.raises(ValueError):
        jd.baseline(seed, TS)
    seed = raw_seed()
    geom = _json.loads(seed["segments"][seg]["geometryJson"]["stringValue"])
    ring = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
    ring[0] = [str(ring[0][0]), ring[0][1]]
    seed["segments"][seg]["geometryJson"] = S(_json.dumps(geom))
    with pytest.raises(ValueError):
        jd.baseline(seed, TS)


def test_the_reset_keeps_team_docs_and_drops_stale_plans_and_segments_with_the_baseline():
    # The seed is validated first (contract, planned teams), so a segment it lacks really was removed; a team doc is
    # kept because codes do not pin a team and a judge may be on it.
    want = jd.baseline(raw_seed(), TS)
    api = FakeApi(extra_docs=["teams/T9", "segments/ZZ", "plans/0020", "events/e1"], media=[])
    deleted_docs, _ = jd.run_reset(api, want)
    deletes = [n for k, n in api.log if k == "delete"]
    assert not any(n.endswith("/teams/T9") for n in deletes)
    assert api.commits[0].count("delete") == 2 and any("plans/0020" in n for n in api.commits[0] if n), \
        "the stale plan and segment go in the same commit as the baseline"
    assert deleted_docs == 3


def test_the_reset_clears_device_records_and_stale_segments_but_keeps_team_docs():
    # A judge's report leaves a timing record under teams/T1/devices; a seed that dropped a segment leaves it behind
    # at an old prior version, which the iPhone refuses. Both go; the team doc itself stays.
    want = jd.baseline(raw_seed(), TS)
    extra = ["teams/T1/devices/u1", "teams/T1/devices/u1/measurements/m1", "teams/T9", "segments/ZZ", "plans/0020"]
    plans, segs, rest, _ = jd.plan_reset(FakeApi(extra_docs=extra, media=[]), want)
    assert [p.rsplit("/", 2)[-2:] for p in plans] == [["plans", "0020"]]
    assert [p.split("/")[-1] for p in segs] == ["ZZ"]
    assert sorted(p.split("drill-judge-1/")[1] for p in rest) == ["teams/T1/devices/u1", "teams/T1/devices/u1/measurements/m1"]
    api = FakeApi(extra_docs=extra, media=[])
    deleted, _ = jd.run_reset(api, want)
    assert deleted == 4 and any("segments/ZZ" in n for n in api.commits[0] if n)
    have = copy.deepcopy(want)
    have["segments/ZZ"] = {"segmentId": S("ZZ")}
    assert any(f.startswith("segments/ZZ") for f in jd.differences(want, have))


def test_polygons_need_finite_numbers_and_rings_of_four_points():
    import json as _json
    import pytest
    seg = next(k for k in raw_seed()["segments"] if k != "ROW")
    for spoil in (lambda ring: ring.__setitem__(0, [float("nan"), ring[0][1]]), lambda ring: ring.__delitem__(slice(1, None))):
        seed = raw_seed()
        geom = _json.loads(seed["segments"][seg]["geometryJson"]["stringValue"])
        ring = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
        spoil(ring)
        seed["segments"][seg]["geometryJson"] = S(_json.dumps(geom))
        with pytest.raises(ValueError):
            jd.baseline(seed, TS)


def test_ids_from_firestore_names_are_used_as_given():
    api = object.__new__(jd.Api)
    api.call = lambda url, body=None, method=None: {"documents": [
        {"name": f"{jd.DOCS}/incidents/drill-judge-1/events/a%23b", "fields": {}},
        {"name": f"{jd.DOCS}/incidents/drill-judge-1/events/a#b", "fields": {}}]}
    assert set(api.collection("incidents/drill-judge-1/events")) == {"a%23b", "a#b"}


def test_the_real_media_delete_takes_404_as_gone_and_raises_on_other_errors():
    import io
    import pytest
    import urllib.error
    api = object.__new__(jd.Api)
    def fail(code):
        def call(url, body=None, method=None):
            raise urllib.error.HTTPError(url, code, "x", {}, io.BytesIO(b""))
        return call
    api.call = fail(404)
    assert api.delete_media("clips/drill-judge-1/a.mp4") is False
    api.call = fail(403)
    with pytest.raises(urllib.error.HTTPError):
        api.delete_media("clips/drill-judge-1/a.mp4")


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
