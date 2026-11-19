"""Tests for tools/extras/publish_scam.py (no network, no clips)."""

import copy
import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("publish_scam", Path(__file__).with_name("publish_scam.py"))
pub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pub)

# FIXTURE: a made-up spike record shaped like the real one; not a real camera check.
SOURCE = {
    "spike": "S-CAM",
    "runAt": "2026-11-18T21:00:00Z",
    "model": "fixture-model",
    "clipSource": "staged",
    "n": 2,
    "passed": 1,
    "latencyMs": [4100, 3900],
    "rawOutput": ["model text", "model text"],
    "clips": [
        {"id": "day-1", "lighting": "day", "timeErrorS": 30, "bearingErrorDeg": 10, "nightColorsUnknown": None,
         "pass": True, "missReasons": [], "tokens": 812},
        {"id": "night-2", "lighting": "night_ir", "timeErrorS": 35, "bearingErrorDeg": 90, "nightColorsUnknown": True,
         "pass": False, "missReasons": ["bearing"], "sizeBytes": 9_100_000},
    ],
}


def test_copy_keeps_only_allowlisted_fields():
    out = pub.publish(copy.deepcopy(SOURCE))
    assert list(out) == ["spike", "runAt", "model", "clipSource", "n", "passed", "clips"]
    assert [list(c) for c in out["clips"]] == [list(pub.CLIP_FIELDS)] * 2
    text = json.dumps(out)
    for dropped in ("latencyMs", "rawOutput", "tokens", "sizeBytes", "model text"):
        assert dropped not in text


@pytest.mark.parametrize(
    "where,key,value",
    [
        ("clip", "fileName", "night-2.mov"),
        ("clip", "personName", "Volunteer"),
        ("top", "clipDir", "/Users/someone/clips"),
        ("clip", "note", "C:\\clips\\night-2.mp4"),
        ("top", "where", "clips/night-2.MOV"),
    ],
)
def test_refuses_a_source_with_a_file_path_or_a_name_field(where, key, value):
    src = copy.deepcopy(SOURCE)
    (src["clips"][1] if where == "clip" else src)[key] = value
    with pytest.raises(ValueError, match="name or a file path"):
        pub.publish(src)


def test_a_model_id_with_a_slash_and_a_direction_field_are_not_mistaken_for_paths_or_names():
    src = copy.deepcopy(SOURCE)
    src["model"] = "publishers/google/models/fixture-model"
    src["clips"][0]["direction"] = "north"
    assert pub.publish(src)["model"] == "publishers/google/models/fixture-model"


def test_refuses_a_source_that_does_not_say_where_its_clips_came_from():
    src = copy.deepcopy(SOURCE)
    del src["clipSource"]
    with pytest.raises(ValueError, match="clipSource"):
        pub.publish(src)
    src["clipSource"] = "somewhere"
    with pytest.raises(ValueError, match="clipSource"):
        pub.publish(src)


def test_refuses_a_source_missing_an_allowlisted_field():
    src = copy.deepcopy(SOURCE)
    del src["clips"][0]["bearingErrorDeg"]
    with pytest.raises(ValueError, match="bearingErrorDeg"):
        pub.publish(src)


def test_check_fails_when_the_copy_differs(tmp_path):
    source = tmp_path / "SCAM.json"
    out = tmp_path / "public" / "scam.json"
    source.write_text(json.dumps(SOURCE))
    assert pub.main(["--source", str(source), "--out", str(out), "--check"]) == 1  # missing
    assert pub.main(["--source", str(source), "--out", str(out)]) == 0
    assert pub.main(["--source", str(source), "--out", str(out), "--check"]) == 0
    written = json.loads(out.read_text())
    written["passed"] = 2
    out.write_text(json.dumps(written))
    assert pub.main(["--source", str(source), "--out", str(out), "--check"]) == 1


def test_a_refused_source_writes_no_file(tmp_path):
    src = copy.deepcopy(SOURCE)
    src["clips"][0]["fileName"] = "day-1.mov"
    source = tmp_path / "SCAM.json"
    # A subfolder: on a case-insensitive disk SCAM.json and scam.json are one file.
    out = tmp_path / "public" / "scam.json"
    source.write_text(json.dumps(src))
    assert pub.main(["--source", str(source), "--out", str(out)]) == 2
    assert not out.exists()
