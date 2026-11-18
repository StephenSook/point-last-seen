"""Tests for the pure parts of tools/seed/seed_drill.py (no network)."""

import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("seed_drill", Path(__file__).with_name("seed_drill.py"))
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

CROCKFORD = set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")


def test_codes_are_8_crockford_symbols_and_differ():
    codes = {seed.make_code() for _ in range(50)}
    assert len(codes) == 50
    assert all(len(c) == 8 and set(c) <= CROCKFORD for c in codes)


def test_code_hash_matches_join_normalization():
    # functions/src/join.ts: uppercase, drop spaces and hyphens, then SHA-256 hex.
    assert seed.code_hash("abcd-2345 ") == hashlib.sha256(b"ABCD2345").hexdigest()


def test_incident_doc_is_a_labelled_drill_without_join_hashes():
    params = json.loads((Path(__file__).resolve().parents[2] / "shared/constants/engine-params.json").read_text())["params"]
    d = seed.incident_doc("drill-dev-1", "Development drill (synthetic)", params)
    assert d["mode"] == "drill" and d["status"] == "open"
    assert d["drillLabel"] == "Training drill. Nobody is missing."
    assert "joinCodeHash" not in d and "commandJoinCodeHash" not in d
    assert d["engineParams"]["sweepWidthFactor"] == 1.645 and d["engineParams"]["detectionProfile"] == {"soundCounts": False}
    assert d["priorInputEventIds"] == [] and d["priorSeed"] == 20261122


def test_join_code_docs_scope_roles():
    team, command = seed.join_code_docs("drill-dev-1")
    assert team == {"incidentId": "drill-dev-1", "roles": ["searcher", "family"]}
    assert command == {"incidentId": "drill-dev-1", "roles": ["command"]}


def test_firestore_value_encoding():
    v = seed.to_value({"a": 1, "b": 1.5, "c": "x", "d": None, "e": [True], "f": {"g": 2}})
    assert v == {"mapValue": {"fields": {
        "a": {"integerValue": "1"}, "b": {"doubleValue": 1.5}, "c": {"stringValue": "x"}, "d": {"nullValue": None},
        "e": {"arrayValue": {"values": [{"booleanValue": True}]}}, "f": {"mapValue": {"fields": {"g": {"integerValue": "2"}}}}}}}
