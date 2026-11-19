"""Tests for the pure parts of tools/seed/seed_segments.py (no network)."""

import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("seed_segments", Path(__file__).with_name("seed_segments.py"))
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

GEOM = json.dumps({"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]})


def seg(i, poa):
    return {"segmentId": i, "priorPoa": poa, "ringPoa": poa, "geometryJson": GEOM, "centroid": {"lat": 1.0, "lon": 2.0},
            "areaM2": 15625.0, "neighbors": [], "upstream": [], "downstream": [], "nearFrac": 0.5, "featureClasses": ["trail"]}


def payload(docs=None):
    return {"gridId": "park-dev", "ipp": {"lat": 33.78, "lon": -84.37}, "terrain": "temperate_flat",
            "layers": {"linear": False, "wedge": False}, "travelBearingDeg": None,
            "attribution": "Map data from OpenStreetMap contributors (ODbL)",
            "docs": docs if docs is not None else [seg("AA", 0.3), seg("AB", 0.2), {"segmentId": "ROW", "priorPoa": 0.5}]}


# The incident's updateTime from the same read that checked its rings: the commit is bound to that version.
UT = "2026-11-19T06:00:00.123456Z"


def test_the_incident_write_goes_first_and_only_onto_the_version_that_was_read():
    # Review round 3: if anyone changes the incident between the read and the commit, the first commit fails and
    # nothing is written, instead of a prior seeded onto settings it was not checked against.
    writes = seed.build_writes("proj", "drill-dev-1", payload(), existing_ids={"ZZ"}, prior_version=3, incident_update_time=UT)
    assert writes[0]["update"]["name"].endswith("/incidents/drill-dev-1")
    assert writes[0]["currentDocument"] == {"updateTime": UT}
    assert all("currentDocument" not in w for w in writes[1:])
    with pytest.raises(TypeError):
        seed.build_writes("proj", "drill-dev-1", payload(), existing_ids=set(), prior_version=3)


def test_valid_payload_passes():
    seed.validate(payload())


@pytest.mark.parametrize("docs, why", [
    ([seg("AA", 0.3), {"segmentId": "ROW", "priorPoa": 0.5}], "sum"),
    ([seg("AA", 0.5), seg("AA", 0.0), {"segmentId": "ROW", "priorPoa": 0.5}], "duplicate"),
    ([{"segmentId": "ROW", "priorPoa": 0.5}, seg("AA", 0.5)], "ROW"),
    ([seg("AA", 1.2), {"segmentId": "ROW", "priorPoa": -0.2}], "negative"),
    ([dict(seg("AA", 0.5), geometryJson="{}"), {"segmentId": "ROW", "priorPoa": 0.5}], "geometry"),
    ([seg("a1", 0.5), {"segmentId": "ROW", "priorPoa": 0.5}], "id"),
    ([{k: v for k, v in seg("AA", 0.5).items() if k != "ringPoa"}, {"segmentId": "ROW", "priorPoa": 0.5}], "keys"),
    ([dict(seg("AA", 0.5), ringPoa=-0.1), {"segmentId": "ROW", "priorPoa": 0.5}], "ringPoa"),
])
def test_bad_payloads_are_refused(docs, why):
    with pytest.raises(ValueError, match=why):
        seed.validate(payload(docs))


def test_writes_set_every_doc_delete_stale_ones_and_update_only_the_named_incident_fields():
    writes = seed.build_writes("proj", "drill-dev-1", payload(), existing_ids={"AA", "ZZ", "ROW"}, prior_version=1, incident_update_time=UT)
    names = [w.get("update", {}).get("name") or w.get("delete") for w in writes]
    base = "projects/proj/databases/(default)/documents/incidents/drill-dev-1"
    assert names == [base, f"{base}/segments/AA", f"{base}/segments/AB", f"{base}/segments/ROW", f"{base}/segments/ZZ"]
    inc = writes[0]
    assert sorted(inc["updateMask"]["fieldPaths"]) == ["engineParams.rings.temperate_flat", "gridAttribution", "gridId", "ipp",
                                                        "priorLayers", "priorVersion", "terrain"]
    f = inc["update"]["fields"]
    assert f["gridId"] == {"stringValue": "park-dev"} and f["priorVersion"] == {"integerValue": "1"}
    assert f["ipp"]["mapValue"]["fields"]["lat"] == {"doubleValue": 33.78}
    assert inc["currentDocument"] == {"updateTime": UT}
    aa = writes[1]["update"]["fields"]
    assert aa["geometryJson"] == {"stringValue": GEOM} and aa["priorPoa"] == {"doubleValue": 0.3}
    assert aa["featureClasses"] == {"arrayValue": {"values": [{"stringValue": "trail"}]}}


def test_every_segment_and_row_carries_the_prior_version_like_a_rebuild_writes_it():
    # Review: the iPhone reads priorVersion on every segment (the same across all, ROW included); the seed wrote it
    # only on the incident, so a seeded mission could not be read.
    writes = seed.build_writes("proj", "drill-x", payload(), existing_ids=set(), prior_version=4, incident_update_time=UT)
    segs = [w["update"]["fields"] for w in writes[1:] if "update" in w]
    assert [f["segmentId"]["stringValue"] for f in segs] == ["AA", "AB", "ROW"]
    assert all(f["priorVersion"] == {"integerValue": "4"} for f in segs)
    assert segs[0]["ringPoa"] == {"doubleValue": 0.3} and "ringPoa" not in segs[2]


def test_writes_are_split_into_commits_of_at_most_500():
    docs = [seg(f"{chr(65 + i // 26)}{chr(65 + i % 26)}", 0.5 / 600) for i in range(600)] + [{"segmentId": "ROW", "priorPoa": 0.5}]
    writes = seed.build_writes("p", "i", payload(docs), existing_ids=set(), prior_version=2, incident_update_time=UT)
    batches = seed.batches(writes)
    assert [len(b) for b in batches] == [500, 102]
    assert batches[0][0]["update"]["name"].endswith("/incidents/i")


def test_the_incident_gets_the_ring_column_for_its_terrain_and_keeps_its_other_params():
    # Review: an incident created before a terrain existed has no rings for it in its stored engineParams.
    rings = json.loads((Path(__file__).resolve().parents[2] / "shared/constants/engine-params.json").read_text())["params"]["rings"]
    writes = seed.build_writes("proj", "drill-dev-1", {**payload(), "terrain": "urban"}, existing_ids=set(), prior_version=2, incident_update_time=UT)
    inc = writes[0]
    assert "engineParams.rings.urban" in inc["updateMask"]["fieldPaths"] and "engineParams" not in inc["updateMask"]["fieldPaths"]
    col = inc["update"]["fields"]["engineParams"]["mapValue"]["fields"]["rings"]["mapValue"]["fields"]
    assert list(col) == ["urban"]
    assert [v["doubleValue"] for v in col["urban"]["arrayValue"]["values"]] == rings["urban"]


def test_the_incident_records_when_its_prior_was_built_at_server_time():
    # For the replay: priorBuiltAt is the server's time of the write that installs the prior.
    inc = seed.build_writes("proj", "drill-dev-1", payload(), existing_ids=set(), prior_version=2, incident_update_time=UT)[0]
    assert inc["updateTransforms"] == [{"fieldPath": "priorBuiltAt", "setToServerValue": "REQUEST_TIME"}]
    assert "priorBuiltAt" not in inc["update"]["fields"]


def test_a_stored_ring_column_is_kept_and_a_different_one_refuses_the_seed():
    # Review round 2: reseeding must not overwrite an incident's own radii, and the seeded prior was built from the
    # sourced radii, so an incident that overrides them cannot take it.
    rings = json.loads((Path(__file__).resolve().parents[2] / "shared/constants/engine-params.json").read_text())["params"]["rings"]
    same = seed.build_writes("proj", "drill-dev-1", {**payload(), "terrain": "urban"}, existing_ids=set(), prior_version=2,
                             stored_rings=rings["urban"], incident_update_time=UT)[0]
    assert not any(f.startswith("engineParams") for f in same["updateMask"]["fieldPaths"])
    assert "engineParams" not in same["update"]["fields"]
    with pytest.raises(ValueError, match="urban"):
        seed.build_writes("proj", "drill-dev-1", {**payload(), "terrain": "urban"}, existing_ids=set(), prior_version=2,
                          stored_rings=[0.3, 1.0, 3.0, 12.0], incident_update_time=UT)
