"""Contract test for shared/test-vectors/grounding.json and its word lists (shared/constants/grounding-words.json).

Every platform grounds a reading in its note with the same word lists and runs these cases; this test keeps the file
well formed so a runner can trust it.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VECTOR = ROOT / "shared/test-vectors/grounding.json"
WORDS = ROOT / "shared/constants/grounding-words.json"
SCHEMA = ROOT / "shared/schemas/report-reading.schema.json"
FIELDS = {"topColor": "color", "bottomColor": "color", "direction": "direction", "footwear": "text", "carried": "text"}


def load(p: Path) -> dict:
    return json.loads(p.read_text())


def enum(field: str) -> list[str]:
    return load(SCHEMA)["properties"][field]["enum"]


def test_the_word_lists_cover_every_value_and_nothing_else():
    w = load(WORDS)
    assert w["schemaVersion"] == 1
    assert sorted(w["colorWords"]) == sorted(v for v in enum("topColor") if v != "unknown")
    assert enum("topColor") == enum("bottomColor")
    assert sorted(w["directionWords"]) == sorted(v for v in enum("direction") if v != "unknown")
    assert set(w["capitalLetters"]) <= set(w["directionWords"])
    for lists in (w["colorWords"], w["directionWords"]):
        for value, words in lists.items():
            assert words and all(x == x.lower() and x.isalpha() for x in words), value
    assert w["minSharedWordLength"] >= 3
    assert all(x == x.lower() and x.isalpha() for x in w["stopWords"])


def test_every_case_is_well_formed():
    v = load(VECTOR)
    assert v["schemaVersion"] == 1
    names = [c["name"] for c in v["cases"]]
    assert len(names) == len(set(names))
    for c in v["cases"]:
        assert set(c) == {"name", "field", "note", "value", "expected"}, c["name"]
        kind = FIELDS[c["field"]]
        if kind == "text":
            assert c["expected"] in (c["value"], ""), c["name"]
        else:
            allowed = enum("direction") if kind == "direction" else enum("topColor")
            assert c["value"] in allowed and c["expected"] in (c["value"], "unknown"), c["name"]


def test_every_field_is_tested_both_ways():
    cases = load(VECTOR)["cases"]
    for field, kind in FIELDS.items():
        blank = "" if kind == "text" else "unknown"
        mine = [c for c in cases if c["field"] == field]
        assert any(c["expected"] == c["value"] != blank for c in mine), f"{field}: no kept case"
        assert any(c["expected"] == blank != c["value"] for c in mine), f"{field}: no blanked case"


def test_the_profile_leak_is_pinned():
    # A model filled "blue" from the subject's profile; the note never said it.
    case = next(c for c in load(VECTOR)["cases"] if c["name"] == "top_color_from_profile")
    assert case["value"] == "blue" and case["expected"] == "unknown" and "blue" not in case["note"].lower()
