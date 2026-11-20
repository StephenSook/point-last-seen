"""The shared phone-number vector (shared/test-vectors/phone-numbers.json) is complete and its contract can fail.

Each platform that removes phone numbers from a note runs this file in its own tests. This test keeps the file
itself honest: the required cases are all there, each case is well formed, and the contract below passes a correct
scrubber and fails a scrubber that does nothing or one that wipes the whole note.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VECTOR = ROOT / "shared/test-vectors/phone-numbers.json"
PLATFORMS = {"ios", "web", "android"}

# The cases the review asked for, in these exact spellings; a removal or rewording must be deliberate.
REQUIRED_REMOVE = ["4 0 4 5 5 5 0 1 4 2", "four oh four five five five oh one four two", "+44 20 7946 0958",
                   "+52 55 1234 5678", "404/555/0142", "(404) 555-0142", "404 555 0142",
                   "06.12.20.26.19", "404-555-2026-11-19", "404‑555‑0142", "404‐555‐0142",
                   "404–555–0142", "404 555\r\n0142",
                   # A grouped count of seven or more digits is a number too (privacy wins ties).
                   "4,045,550,142", "OH 41234-5678",
                   "\U0001E954,\U0001E950\U0001E954\U0001E955,\U0001E955\U0001E955\U0001E950,\U0001E951\U0001E954\U0001E952",
                   "555\u00b41234", "555\u00851234", "\u2776\u2777\u2778\u2779\u277a\u277b\u277c", "幺三八幺二三四五六七八",
                   # A + right before a decimal pair marks a phone number, not a coordinate.
                   "+44.2071, -23.4567",
                   # A bare minus between decimals is how a number is written; an ordinal joins unless a street word follows.
                   "44.2071-23.4567", "4550 142nd",
                   # A time shields itself only after a date, never joined to other digits before its hour.
                   "1 404 555 01:42", "GA 40455-5014 2:30"]
# A date in a note is search information, not a phone number, so every platform keeps it; so are coordinates
# (without a leading +), a ZIP+4 code, a grouped count under seven digits, a street number and a number with a unit.
REQUIRED_KEEP = ["14:03", "segment 12", "3 searchers", "45%", "11/19/2026", "2026-11-19", "11/19", "Nov 19",
                 "GPS 33.7490, -84.3880", "Atlanta, GA 30301-1234", "walked 12,345 steps", "12345 67th Ave", "5km",
                 "Seen Nov \r\n19 2026", "GPS 33.7490,\r\n-84.3880", "Seen Nov\r\n\r\n19 2026",
                 "Seen 11/19/2026 14:03", "near 4550 142nd St"]
REQUIRED_EXACT = [("Seen at 14:03, 404-555-0142", "Seen at 14:03, [number removed]"),
                  # A date stays when the rest of its run is a whole number: when someone was seen is search
                  # information, and keeping it leaks nothing once the number beside it is gone.
                  ("Seen 11/19/2026 404-555-0142", "Seen 11/19/2026 [number removed]"),
                  ("Seen 2026-11-19 404-555-0142", "Seen 2026-11-19 [number removed]"),
                  ("Seen 11/19 555-0142", "Seen 11/19 [number removed]"),
                  ("Seen 11/19/2026, call 404-555-0142", "Seen 11/19/2026, call [number removed]"),
                  ("Seen Nov 19 2026 404-555-0142", "Seen Nov 19 2026 [number removed]"),
                  ("Seen 11/19/2026 14:03 404-555-0142", "Seen 11/19/2026 14:03 [number removed]")]


def number_chars(text: str) -> bool:
    """Any character Unicode files as a number (Nd, Nl, No): digits in every script, dingbat and circled digits."""
    return any(unicodedata.category(ch).startswith("N") for ch in text)


def load() -> dict:
    return json.loads(VECTOR.read_text())


def remove_violations(case: dict, output: str) -> list[str]:
    """What a scrubber's output gets wrong for one mustRemove case (the contract every platform applies)."""
    out = []
    if case["number"] in output:
        out.append("number still present")
    if number_chars(output):
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
        assert not number_chars(c["input"].replace(c["number"], ""))
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


def test_a_leftover_digit_in_any_script_is_caught():
    # An Adlam or a dingbat digit left behind is still a digit: the check is not limited to 0-9.
    case = {"number": "x", "forbidden": [], "keep": []}
    assert remove_violations(case, "Call \U0001E954") == ["a digit is left"]
    assert remove_violations(case, "call \u2776 now") == ["a digit is left"]
    assert remove_violations(case, "Call [number removed]") == []

