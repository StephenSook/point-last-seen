"""Anchor tests for shared/test-vectors/search.json (hand-checked values)."""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

from pytest import approx

ROOT = Path(__file__).resolve().parents[2]
V = ROOT / "shared" / "test-vectors" / "search.json"
GEN = ROOT / "tools" / "vectors" / "make_vectors.py"
SECTIONS = ["pod", "trackLength", "ioc", "posterior", "orderIndependence", "deriveEffect",
            "docToEngine", "rank", "ids", "router", "evidence"]


def load(path):
    return json.loads(Path(path).read_text())


def case(v, section, name):
    matches = [c for c in v[section] if c["name"] == name]
    assert len(matches) == 1, f"{section}/{name}: {len(matches)} cases"
    return matches[0]


def test_anchors():
    v = load(V)
    assert v["sections"] == SECTIONS
    assert case(v, "pod", "coverage_1")["expected"] == approx(0.6321205588285577, rel=1e-12)
    assert case(v, "trackLength", "sweep_30min_4")["expected"] == approx(2808.0)  # 0.39 x 1800 x 4
    assert case(v, "ioc", "against_medium")["expected"] == approx(0.64)
    b = case(v, "posterior", "bayes_cleared_half")["expected"]["poa"]  # A 0.5, B 0.3, ROW 0.2; A cleared at 0.5
    assert b == {"A": approx(1 / 3), "B": approx(0.4), "ROW": approx(4 / 15)}
    # Plan anchor "remainingMassOfA": remainingMass is a per-segment map (ledger ruling).
    assert case(v, "posterior", "frost_remaining")["expected"]["remainingMass"]["A"] == approx(0.15)
    c = case(v, "posterior", "casie_worked_example")["expected"]["poa"]  # priors .31 .31 .31 .07; IOC .917 1 .5 .771
    assert [round(c[k], 3) for k in ("S1", "S2", "S3", "S4")] == [0.354, 0.386, 0.193, 0.067]


def test_minutes_are_converted_to_seconds():
    e = case(load(V), "deriveEffect", "sweep_45min_3_searchers_100000m2_rd10")["expected"]
    assert e["inputs"]["trackLengthM"] == approx(3159.0)  # 0.39 x (45 x 60) x 3
    assert e["inputs"]["coverage"] == approx(0.5196555)  # 16.45 x 3159 / 100000
    assert 0.40 < e["pod"] < 0.41  # without the x 60 it is under 0.01


def test_coverage_normalization_cases():
    v = load(V)
    assert case(v, "deriveEffect", "coverage_80_percent")["expected"]["inputs"]["coverage"] == approx(0.8)
    assert case(v, "deriveEffect", "coverage_0_8_ratio")["expected"]["inputs"]["coverage"] == approx(0.8)
    assert case(v, "deriveEffect", "coverage_400_invalid")["expected"] == {"kind": "none", "why": "invalid"}


def test_prior_inputs_are_never_likelihoods():
    v = load(V)
    assert case(v, "docToEngine", "confirmed_camera_sighting")["expected"] == []
    assert case(v, "docToEngine", "confirmed_destination")["expected"] == []
    assert case(v, "docToEngine", "sighting_promoted_to_start_point")["expected"] == []
    assert len(case(v, "docToEngine", "confirmed_public_sighting")["expected"]) == 1


def test_rule_cases_and_ids():
    v = load(V)
    assert case(v, "deriveEffect", "sound_only_gives_none")["expected"] == {"kind": "none", "why": "sound_only"}
    assert case(v, "docToEngine", "sighting_outside_grid_ignored")["expected"] == []
    assert case(v, "evidence", "blood_on_a_rock")["expected"] is True
    assert case(v, "evidence", "cleared_segment_ac")["expected"] is False
    a, b = case(v, "ids", "ab_c_1")["expected"]["eventId"], case(v, "ids", "a_bc_1")["expected"]["eventId"]
    assert a != b and len(a) == 32
    assert sum(len(v[s]) for s in v["sections"]) >= 52


def frame(fields):
    out = b""
    for f in fields:
        data = f.encode("utf-8")
        out += len(data).to_bytes(4, "big") + data
    return out


def test_event_id_layout_is_length_prefixed_sha256():
    c = case(load(V), "ids", "ab_c_1")
    expect = hashlib.sha256(frame(["ab", "c", "1"])).hexdigest()[:32]
    assert c["input"] == {"fn": "eventId", "incidentId": "ab", "deviceId": "c", "seq": 1}
    assert c["expected"] == {"eventId": expect}


def test_event_set_hash_layout_and_convergence_code():
    v = load(V)
    empty = case(v, "ids", "event_set_empty_v1")
    assert empty["expected"]["eventSetHash"] == hashlib.sha256(frame(["1"])).hexdigest()
    same = case(v, "ids", "event_set_reordered_with_duplicate")["expected"]
    base = case(v, "ids", "event_set_three_v1")["expected"]
    assert same == base
    other = case(v, "ids", "event_set_three_v2")["expected"]
    assert other["eventSetHash"] != base["eventSetHash"] and len(base["eventSetHash"]) == 64
    for c in v["ids"]:
        if "convergenceCode" in c["expected"]:
            assert re.fullmatch(r"[0-9A-HJKMNP-TV-Z]{4}", c["expected"]["convergenceCode"])
    # 0xFFFFF... gives "ZZZZ"; 0x00000... gives "0000"; 0x08421... gives "1111"
    assert case(v, "ids", "code_all_ones")["expected"]["convergenceCode"] == "ZZZZ"
    assert case(v, "ids", "code_all_zeros")["expected"]["convergenceCode"] == "0000"
    assert case(v, "ids", "code_ones_in_each_group")["expected"]["convergenceCode"] == "1111"


def test_every_section_well_formed():
    v = load(V)
    for s in SECTIONS:
        assert v[s], s
        names = [c["name"] for c in v[s]]
        assert len(names) == len(set(names)), s
        for c in v[s]:
            assert set(c) == {"name", "input", "expected"}, (s, c["name"])
    assert len(v["evidence"]) >= 10


def test_router_never_returns_cloud_after_block_or_refusal():
    v = load(V)
    after = [c for c in v["router"] if c["input"]["fn"] == "afterFailure"]
    assert after
    for c in after:
        if c["input"]["failure"] in ("guardrail_block", "refusal"):
            assert c["expected"]["next"] in ("stage", "pick_list")
            assert c["expected"]["next"] != "reroute_without_on_device"
            assert c["expected"].get("stage") != "cloud"


def test_generator_is_deterministic_and_checked_in():
    out = subprocess.run([sys.executable, "-I", str(GEN), "--check"], capture_output=True, text=True)
    assert out.returncode == 0, out.stdout + out.stderr


def test_command_confirmation_outranks_a_later_family_one():
    v = load(V)
    assert case(v, "docToEngine", "family_confirm_after_command_reject_ignored")["expected"] == []
    assert len(case(v, "docToEngine", "command_confirm_after_family_reject_counts")["expected"]) == 1


def test_malformed_stored_effects_are_skipped_not_fatal():
    v = load(V)
    for name in ("malformed_cleared_without_inputs_skipped", "malformed_cleared_pod_as_text_skipped",
                 "malformed_cleared_unknown_rd_basis_skipped", "malformed_clue_unknown_influence_skipped",
                 "malformed_clue_empty_influences_skipped", "malformed_effect_null_skipped",
                 "malformed_none_without_reason_skipped"):
        assert case(v, "docToEngine", name)["expected"] == [], name
    assert len(case(v, "docToEngine", "malformed_beside_good_events_keeps_the_good")["expected"]) == 2
