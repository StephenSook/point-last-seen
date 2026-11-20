"""The shared phone-number vector (shared/test-vectors/phone-numbers.json) is complete and its contract can fail.

Each platform that removes phone numbers from a note runs this file in its own tests. This test keeps the file
itself honest: the required cases are all there, each case is well formed, and the contract below passes a correct
scrubber and fails a scrubber that does nothing or one that wipes the whole note.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VECTOR = ROOT / "shared/test-vectors/phone-numbers.json"
PLATFORMS = {"ios", "web", "android"}

# The cases the review asked for, in these exact spellings; a removal or rewording must be deliberate.
REQUIRED_REMOVE = ["4 0 4 5 5 5 0 1 4 2", "four oh four five five five oh one four two", "+44 20 7946 0958",
                   "+52 55 1234 5678", "404/555/0142", "(404) 555-0142", "404 555 0142",
                   "06.12.20.26.19", "404-555-2026-11-19", "404‑555‑0142", "404‐555‐0142",
                   "404–555–0142", "404 555\r\n0142"]
# A date in a note is search information, not a phone number, so every platform keeps it; so are coordinates,
# a ZIP+4 code, a grouped count, a street number and a number with a unit.
REQUIRED_KEEP = ["14:03", "segment 12", "3 searchers", "45%", "11/19/2026", "2026-11-19", "11/19", "Nov 19",
                 "GPS 33.7490, -84.3880", "Atlanta, GA 30301-1234", "walked 1,234,567 steps", "12345 67th Ave", "5km"]
REQUIRED_EXACT = [("Seen at 14:03, 404-555-0142", "Seen at 14:03, [number removed]")]


def load() -> dict:
    return json.loads(VECTOR.read_text())


def remove_violations(case: dict, output: str) -> list[str]:
    """What a scrubber's output gets wrong for one mustRemove case (the contract every platform applies)."""
    out = []
    if case["number"] in output:
        out.append("number still present")
    if re.search(r"[0-9]", output):
        out.append("a digit is left")
    out += [f"fragment left: {f}" for f in case["forbidden"] if f in output]
    out += [f"lost surrounding text: {k}" for k in case["keep"] if k not in output]
    return out


def keep_violations(case: dict, output: str) -> list[str]:
    return [] if output == case["input"] else ["changed text that holds no phone number"]


def exact_violations(case: dict, output: str) -> list[str]:
    """An exact case: the output must equal `output` byte for byte."""
    return [] if output == case["output"] else ["output differs from the expected text"]


def test_the_required_cases_are_all_present():
    d = load()
    assert d["schemaVersion"] == 1
    assert d["replacement"] == "[number removed]"
    assert [c["number"] for c in d["mustRemove"]] == REQUIRED_REMOVE
    inputs = [c["input"] for c in d["mustKeep"]]
    for s in REQUIRED_KEEP:
        assert s in inputs
    assert [(c["input"], c["output"]) for c in d["exact"]] == REQUIRED_EXACT


def test_every_case_is_well_formed():
    d = load()
    names = [c["name"] for c in d["mustRemove"] + d["mustKeep"] + d["exact"]]
    assert len(names) == len(set(names))
    assert all(re.fullmatch(r"[a-z_]+", n) for n in names)
    for c in d["mustRemove"] + d["mustKeep"] + d["exact"]:
        # A platform whose rule cannot pass a case yet is named here, and its runner skips the case until it can.
        assert set(c.get("pendingOn", [])) <= PLATFORMS, c["name"]
    for c in d["mustRemove"]:
        assert set(c) - {"pendingOn"} == {"name", "input", "number", "forbidden", "keep"}
        assert c["input"].count(c["number"]) == 1
        # The number is the only digit run, so "no digit is left" tests the scrubber and nothing else.
        assert not re.search(r"[0-9]", c["input"].replace(c["number"], ""))
        assert all(f in c["number"] for f in c["forbidden"])
        assert c["keep"] and all(k in c["input"] and k not in c["number"] for k in c["keep"])
    for c in d["mustKeep"]:
        assert set(c) - {"pendingOn"} == {"name", "input"}
    for c in d["exact"]:
        assert set(c) - {"pendingOn"} == {"name", "input", "output"}
        assert d["replacement"] in c["output"] and c["output"] != c["input"]


def test_the_contract_passes_a_correct_scrubber():
    d = load()
    for c in d["mustRemove"]:
        assert remove_violations(c, c["input"].replace(c["number"], d["replacement"])) == [], c["name"]
    for c in d["mustKeep"]:
        assert keep_violations(c, c["input"]) == [], c["name"]
    for c in d["exact"]:
        assert exact_violations(c, c["output"]) == [], c["name"]


def test_the_contract_fails_a_scrubber_that_does_nothing_or_wipes_the_note():
    d = load()
    for c in d["mustRemove"]:
        assert "number still present" in remove_violations(c, c["input"]), c["name"]
        assert any(v.startswith("lost surrounding text") for v in remove_violations(c, d["replacement"])), c["name"]
    for c in d["mustKeep"]:
        assert keep_violations(c, d["replacement"]) != [], c["name"]
    for c in d["exact"]:
        assert exact_violations(c, c["input"]) != [], c["name"]
        # Byte for byte: a different token, or an extra space, fails.
        assert exact_violations(c, c["output"].replace(d["replacement"], "[removed]")) != [], c["name"]
        assert exact_violations(c, c["output"] + " ") != [], c["name"]
