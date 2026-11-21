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


def test_event_id_layout_is_text_length_prefixed_sha256():
    # eventId framing (design decision H1): decimal UTF-8 byte length, ":", value, per field, so the
    # security rules can recompute it. Worked example: "ab", "c", 1 hashes the string "2:ab1:c1:1".
    c = case(load(V), "ids", "ab_c_1")
    assert c["input"] == {"fn": "eventId", "incidentId": "ab", "deviceId": "c", "seq": 1}
    assert c["expected"] == {"eventId": hashlib.sha256(b"2:ab1:c1:1").hexdigest()[:32]}
    assert case(load(V), "ids", "a_bc_1")["expected"]["eventId"] == hashlib.sha256(b"1:a2:bc1:1").hexdigest()[:32]


def test_event_id_utf8_and_epoch_ms_cases():
    v = load(V)
    u = case(v, "ids", "utf8_lengths_are_bytes")
    raw = "5:caf\u00e97:\u00e9quipe1:3".encode("utf-8")
    assert u["expected"]["eventId"] == hashlib.sha256(raw).hexdigest()[:32]
    e = case(v, "ids", "epoch_ms_seq")
    assert e["input"]["seq"] == 1795860000000
    assert e["expected"]["eventId"] == hashlib.sha256(b"11:drill-dev-19:uid123ABC13:1795860000000").hexdigest()[:32]


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


def test_measured_detection_range_beats_a_stated_one():
    # Spec 10.4: sweep width always uses the visual detection range the team measured. A model-read
    # range is used only when there is no measurement, so it can never raise POD above a measurement.
    v = load(V)
    m = case(v, "deriveEffect", "measured_range_beats_stated")["expected"]["inputs"]
    assert m["sweepWidthM"] == approx(16.45) and m["rdBasis"] == "hidden_target"
    s = case(v, "deriveEffect", "stated_range_used_without_measurement")["expected"]["inputs"]
    assert s["sweepWidthM"] == approx(8.225) and s["rdBasis"] == "stated"


def _mv():
    import importlib.util
    spec = importlib.util.spec_from_file_location("make_vectors", GEN)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_linear_weights_are_neutral_at_or_above_the_isrid_share():
    mv = _mv()
    # Review ruling 2026-11-18: the layer only raises density near features toward 75%.
    assert mv.linear_weights([0.1, 0.2, 0.3], [1.0, 0.95, 0.9]) == [1.0, 1.0, 1.0]
    assert mv.linear_weights([1.0, 1.0], [1.0, 0.5]) == [1.0, 1.0]
    assert mv.linear_weights([0.5, 0.5], [1.0, 0.0]) == [1.5, 0.5]
    near_below = mv.linear_weights([1.0, 1.0], [1.0, 0.4999])
    assert all(abs(w - 1) < 1e-3 for w in near_below)


def test_elevation_weights_give_each_class_its_isrid_share():
    # Koester, Lost Person Behavior, dementia p.164, temperate: uphill 19%, same 39%, downhill 42%. Level is within
    # 3 m of the start (ours: the source defines no band).
    mv = _mv()
    shares = {"up": 0.19, "level": 0.39, "down": 0.42}
    mass = [0.25, 0.25, 0.25, 0.25]
    w = mv.elevation_weights(mass, [10.0, 0.0, -10.0, -20.0], shares, 3.0)
    new = [m * x for m, x in zip(mass, w)]
    assert abs(new[0] - 0.19) < 1e-12 and abs(new[1] - 0.39) < 1e-12 and abs(new[2] + new[3] - 0.42) < 1e-12
    assert abs(sum(new) - sum(mass)) < 1e-12


def test_elevation_weights_return_an_empty_class_share_pro_rata_and_leave_no_data_alone():
    mv = _mv()
    shares = {"up": 0.19, "level": 0.39, "down": 0.42}
    # No uphill segment: level and downhill split the classified mass 39:42.
    w = mv.elevation_weights([0.5, 0.5], [0.0, -10.0], shares, 3.0)
    assert abs(0.5 * w[0] - 39 / 81) < 1e-12 and abs(0.5 * w[1] - 42 / 81) < 1e-12
    # A segment with no elevation keeps its weight; the others share only their own mass.
    w = mv.elevation_weights([0.2, 0.4, 0.4], [None, 5.0, -5.0], shares, 3.0)
    assert w[0] == 1.0 and abs(0.4 * w[1] - 0.8 * 0.19 / 0.61) < 1e-12
    # The band edge counts as level; zero mass or one class only changes nothing.
    assert mv.elevation_weights([0.5, 0.5], [3.0, -3.0], shares, 3.0) == [1.0, 1.0]
    assert mv.elevation_weights([0.0, 0.0], [10.0, -10.0], shares, 3.0) == [1.0, 1.0]
    assert mv.elevation_weights([0.3, 0.7], [None, None], shares, 3.0) == [1.0, 1.0]


def test_urgency_follows_the_cdc_40f_line_and_ignores_clothing():
    mv = _mv()
    assert [mv.urgency_level(t, w) for t, w in [(40, False), (41, True), (41, False), (39, True)]] == ["cold", "cool_wet", "none", "cold"]
    assert mv.urgency_level(None, True) == "none" and mv.urgency_level(50, None) == "none"
