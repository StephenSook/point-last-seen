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


def test_one_join_code_per_role():
    docs = seed.join_code_docs("drill-dev-1")
    assert docs == {
        "searcher": {"incidentId": "drill-dev-1", "roles": ["searcher"]},
        "family": {"incidentId": "drill-dev-1", "roles": ["family"]},
        "command": {"incidentId": "drill-dev-1", "roles": ["command"]},
    }
    assert seed.KEYCHAIN_SERVICES == {"searcher": "pls-drill-searcher-code", "family": "pls-drill-family-code",
                                      "command": "pls-drill-command-code"}


def test_firestore_value_encoding():
    v = seed.to_value({"a": 1, "b": 1.5, "c": "x", "d": None, "e": [True], "f": {"g": 2}})
    assert v == {"mapValue": {"fields": {
        "a": {"integerValue": "1"}, "b": {"doubleValue": 1.5}, "c": {"stringValue": "x"}, "d": {"nullValue": None},
        "e": {"arrayValue": {"values": [{"booleanValue": True}]}}, "f": {"mapValue": {"fields": {"g": {"integerValue": "2"}}}}}}}


def test_make_codes_returns_three_distinct_codes_even_after_a_collision(monkeypatch):
    draws = iter(["AAAA2222", "AAAA2222", "BBBB3333", "CCCC4444", "DDDD5555", "EEEE6666"])
    monkeypatch.setattr(seed, "make_code", lambda: next(draws))
    codes = seed.make_codes()
    assert set(codes) == {"searcher", "family", "command"}
    assert len(set(codes.values())) == 3


def test_rotation_swaps_the_code_doc_in_one_commit_with_preconditions():
    # Rotating a role's code creates the new hash doc only if it does not exist and deletes the old one only if
    # it does, in one atomic commit, so a failure leaves the old code working and nothing half-done.
    writes = seed.rotation_writes("p", "drill-dev-1", "family", "OLDCODE1", "NEWCODE2")
    create, delete = writes
    assert create["update"]["name"].endswith(f"joinCodes/{seed.code_hash('NEWCODE2')}")
    assert create["currentDocument"] == {"exists": False}
    assert create["updateTransforms"] == [{"fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"}]
    fields = create["update"]["fields"]
    assert fields["incidentId"] == {"stringValue": "drill-dev-1"}
    assert fields["roles"] == {"arrayValue": {"values": [{"stringValue": "family"}]}}
    assert delete == {"delete": f"projects/p/databases/(default)/documents/joinCodes/{seed.code_hash('OLDCODE1')}",
                      "currentDocument": {"exists": True}}


def test_a_new_code_differs_from_every_current_code():
    new = seed.make_rotated_code({"OLDCODE1", "SEARCHR1"})
    assert len(new) == 8 and new not in {"OLDCODE1", "SEARCHR1"}


def test_a_code_is_written_to_the_keychain_on_stdin_never_in_arguments(monkeypatch):
    # Arguments are visible to every local process (ps); the code must travel on stdin only.
    import subprocess as sp
    calls = []

    def fake_run(args, **kw):
        calls.append((args, kw.get("input")))
        out = "ABCDEFGH" if "find-generic-password" in args else ""
        return sp.CompletedProcess(args, 0, out, "")

    monkeypatch.setattr(seed.subprocess, "run", fake_run)
    seed.keychain_store("pls-drill-family-code", "drill-dev-1", "ABCDEFGH")
    assert all("ABCDEFGH" not in " ".join(args) for args, _ in calls)
    assert any(inp and "ABCDEFGH" in inp for _, inp in calls)


def test_team_ids_must_be_ones_a_push_reaches_and_at_most_ten():
    # A plan holds at most 10 assignments (the security rules), one a team, and a push reaches only plain ids.
    import pytest
    assert seed.check_teams(["T1", "T2"]) == ["T1", "T2"]
    assert seed.check_teams([f"T{i}" for i in range(10)]) == [f"T{i}" for i in range(10)]
    for bad in ([f"T{i}" for i in range(11)], [], ["T-1"], ["family"], ["Family"], ["x" * 33], ["T1", "T1"]):
        with pytest.raises(SystemExit):
            seed.check_teams(bad)
