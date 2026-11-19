"""Tests for tools/seed/segment_contract.py: an incident's segment docs must have the shape the apps decode, the one
in shared/test-vectors/pack-segments-sample.json (no network)."""
import copy
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("segment_contract", Path(__file__).with_name("segment_contract.py"))
sc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sc)

VECTOR = json.loads((Path(__file__).resolve().parents[2] / "shared/test-vectors/pack-segments-sample.json").read_text())


def sample() -> dict[str, dict]:
    return {d["id"]: sc.plain_fields(d["fields"]) for d in VECTOR["segments"]}


def test_the_sample_the_apps_decode_passes():
    docs = sample()
    version = docs["ROW"]["priorVersion"]
    assert sc.check(docs, version, complete=False) == []


def test_the_field_sets_come_from_the_sample():
    assert "priorVersion" in sc.SEGMENT_FIELDS and "ringPoa" in sc.SEGMENT_FIELDS and "geometryJson" in sc.SEGMENT_FIELDS
    assert sc.ROW_FIELDS == {"segmentId", "priorPoa", "priorVersion"}


def test_each_way_a_doc_can_be_unreadable_is_named():
    base = sample()
    version = base["ROW"]["priorVersion"]
    seg = next(k for k in base if k != "ROW")
    cases = {
        "missing priorVersion": lambda d: d[seg].pop("priorVersion"),
        "geometryJson as a map": lambda d: d[seg].__setitem__("geometryJson", {"type": "Polygon"}),
        "geometry not a polygon": lambda d: d[seg].__setitem__("geometryJson", json.dumps({"type": "Point", "coordinates": [0, 0]})),
        "two prior versions": lambda d: d[seg].__setitem__("priorVersion", version + 1),
        "a negative prior": lambda d: d[seg].__setitem__("priorPoa", -1.0),
        "no area": lambda d: d[seg].__setitem__("areaM2", 0),
        "a centroid without lon": lambda d: d[seg]["centroid"].pop("lon"),
        "an id that is not the doc's": lambda d: d[seg].__setitem__("segmentId", "ZZ"),
        "an unknown field": lambda d: d[seg].__setitem__("extra", 1),
        "no ROW": lambda d: d.pop("ROW"),
    }
    for what, change in cases.items():
        docs = copy.deepcopy(base)
        change(docs)
        assert sc.check(docs, version, complete=False), what


def test_a_multipolygon_is_readable_and_the_incident_version_must_match():
    docs = sample()
    version = docs["ROW"]["priorVersion"]
    seg = next(k for k in docs if k != "ROW")
    poly = json.loads(docs[seg]["geometryJson"])
    docs[seg]["geometryJson"] = json.dumps({"type": "MultiPolygon", "coordinates": [poly["coordinates"]]})
    assert sc.check(docs, version, complete=False) == []
    assert any("incident" in p for p in sc.check(docs, version + 1, complete=False))


def test_a_complete_incident_must_sum_to_one():
    docs = sample()
    assert any("sum" in p for p in sc.check(docs, docs["ROW"]["priorVersion"], complete=True))
