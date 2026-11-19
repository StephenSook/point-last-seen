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
    return {"segmentId": i, "priorPoa": poa, "geometryJson": GEOM, "centroid": {"lat": 1.0, "lon": 2.0}, "areaM2": 15625.0,
            "neighbors": [], "upstream": [], "downstream": [], "nearFrac": 0.5, "featureClasses": ["trail"]}


def payload(docs=None):
    return {"gridId": "park-dev", "ipp": {"lat": 33.78, "lon": -84.37}, "terrain": "temperate_flat",
            "layers": {"linear": False, "wedge": False}, "travelBearingDeg": None,
            "attribution": "Map data from OpenStreetMap contributors (ODbL)",
            "docs": docs if docs is not None else [seg("AA", 0.3), seg("AB", 0.2), {"segmentId": "ROW", "priorPoa": 0.5}]}


def test_valid_payload_passes():
    seed.validate(payload())


@pytest.mark.parametrize("docs, why", [
    ([seg("AA", 0.3), {"segmentId": "ROW", "priorPoa": 0.5}], "sum"),
    ([seg("AA", 0.5), seg("AA", 0.0), {"segmentId": "ROW", "priorPoa": 0.5}], "duplicate"),
    ([{"segmentId": "ROW", "priorPoa": 0.5}, seg("AA", 0.5)], "ROW"),
    ([seg("AA", 1.2), {"segmentId": "ROW", "priorPoa": -0.2}], "negative"),
    ([dict(seg("AA", 0.5), geometryJson="{}"), {"segmentId": "ROW", "priorPoa": 0.5}], "geometry"),
    ([seg("a1", 0.5), {"segmentId": "ROW", "priorPoa": 0.5}], "id"),
])
def test_bad_payloads_are_refused(docs, why):
    with pytest.raises(ValueError, match=why):
        seed.validate(payload(docs))


def test_writes_set_every_doc_delete_stale_ones_and_update_only_the_named_incident_fields():
    writes = seed.build_writes("proj", "drill-dev-1", payload(), existing_ids={"AA", "ZZ", "ROW"}, prior_version=1)
    names = [w.get("update", {}).get("name") or w.get("delete") for w in writes]
    base = "projects/proj/databases/(default)/documents/incidents/drill-dev-1"
    assert names == [f"{base}/segments/AA", f"{base}/segments/AB", f"{base}/segments/ROW", f"{base}/segments/ZZ", base]
    inc = writes[-1]
    assert sorted(inc["updateMask"]["fieldPaths"]) == ["engineParams.rings.temperate_flat", "gridAttribution", "gridId", "ipp",
                                                        "priorLayers", "priorVersion", "terrain"]
    f = inc["update"]["fields"]
    assert f["gridId"] == {"stringValue": "park-dev"} and f["priorVersion"] == {"integerValue": "1"}
    assert f["ipp"]["mapValue"]["fields"]["lat"] == {"doubleValue": 33.78}
    assert inc["currentDocument"] == {"exists": True}
    aa = writes[0]["update"]["fields"]
    assert aa["geometryJson"] == {"stringValue": GEOM} and aa["priorPoa"] == {"doubleValue": 0.3}
    assert aa["featureClasses"] == {"arrayValue": {"values": [{"stringValue": "trail"}]}}


def test_writes_are_split_into_commits_of_at_most_500():
    docs = [seg(f"{chr(65 + i // 26)}{chr(65 + i % 26)}", 0.5 / 600) for i in range(600)] + [{"segmentId": "ROW", "priorPoa": 0.5}]
    writes = seed.build_writes("p", "i", payload(docs), existing_ids=set(), prior_version=2)
    batches = seed.batches(writes)
    assert [len(b) for b in batches] == [500, 102]
    assert batches[-1][-1]["update"]["name"].endswith("/incidents/i")


def test_the_incident_gets_the_ring_column_for_its_terrain_and_keeps_its_other_params():
    # Review: an incident created before a terrain existed has no rings for it in its stored engineParams.
    rings = json.loads((Path(__file__).resolve().parents[2] / "shared/constants/engine-params.json").read_text())["params"]["rings"]
    writes = seed.build_writes("proj", "drill-dev-1", {**payload(), "terrain": "urban"}, existing_ids=set(), prior_version=2)
    inc = writes[-1]
    assert "engineParams.rings.urban" in inc["updateMask"]["fieldPaths"] and "engineParams" not in inc["updateMask"]["fieldPaths"]
    col = inc["update"]["fields"]["engineParams"]["mapValue"]["fields"]["rings"]["mapValue"]["fields"]
    assert list(col) == ["urban"]
    assert [v["doubleValue"] for v in col["urban"]["arrayValue"]["values"]] == rings["urban"]


def test_the_incident_records_when_its_prior_was_built_at_server_time():
    # For the replay: priorBuiltAt is the server's time of the write that installs the prior.
    inc = seed.build_writes("proj", "drill-dev-1", payload(), existing_ids=set(), prior_version=2)[-1]
    assert inc["updateTransforms"] == [{"fieldPath": "priorBuiltAt", "setToServerValue": "REQUEST_TIME"}]
    assert "priorBuiltAt" not in inc["update"]["fields"]
