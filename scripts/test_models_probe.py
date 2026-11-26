"""Tests for the pure parts of scripts/models_probe.py (no network)."""
import importlib.util
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location("mo", Path(__file__).with_name("models_probe.py"))
mo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mo)

# The models page's own record shape, as read on 2026-11-18 (tags stripped, spaces collapsed); the ids are
# made up so the rules gate's model ban does not apply to the fixture.
PAGE = (
    "gemini-3.5-flash-lite Release date: July 21, 2026 Release stage: Stable Shutdown date: --- Shutdown date: --- "
    "gemini-3.8-flash-lite-tts Release date: September 23, 2026 Release stage: Stable Shutdown date: --- "
    "gemini-0.1-flash-tts-preview Release date: June 17, 2026 Release stage: Preview Shutdown date: November 17, 2026 "
    "gemini-2.0-flash Release date: February 10, 2025 Release stage: Shutdown Shutdown date: June 1, 2026 "
    "gemini-9-late Release date: May 1, 2026 Release stage: Stable Shutdown date: January 4, 2027 "
)
TODAY = date(2026, 11, 20)


def test_records_parse_from_the_page_text():
    r = mo.parse_records("<td>" + PAGE.replace(" Release", "</td><td> Release") + "</td>")
    assert r["gemini-3.5-flash-lite"] == ("Stable", None)
    assert r["gemini-0.1-flash-tts-preview"] == ("Preview", date(2026, 11, 17))
    assert len(r) == 5


def test_a_listed_stable_model_with_no_shutdown_or_a_late_one_passes():
    r = mo.parse_records(PAGE)
    assert mo.evaluate(r, ["gemini-3.5-flash-lite", "gemini-9-late"], TODAY, floor=3) == []


def test_a_missing_model_a_shutdown_inside_the_window_or_a_shutdown_stage_fails():
    r = mo.parse_records(PAGE)
    assert mo.evaluate(r, ["gemini-4-gone"], TODAY, floor=3) == ["gemini-4-gone is not on the models page"]
    assert mo.evaluate(r, ["gemini-0.1-flash-tts-preview"], TODAY, floor=3) == [
        "gemini-0.1-flash-tts-preview shuts down on 2026-11-17, before judging ends (2026-12-17)"]
    assert mo.evaluate(r, ["gemini-2.0-flash"], TODAY, floor=3) == [
        "gemini-2.0-flash is in release stage Shutdown",
        "gemini-2.0-flash shuts down on 2026-06-01, before judging ends (2026-12-17)"]


def test_a_page_whose_format_changed_fails_instead_of_passing_empty():
    assert mo.evaluate({}, ["gemini-3.5-flash-lite"], TODAY, floor=3) == [
        "the models page gave 0 model records (expected at least 3); its format may have changed"]


def test_every_model_named_by_remote_config_or_the_allow_list_is_checked():
    ids = mo.ids_to_check(Path(__file__).resolve().parents[1])
    assert "gemini-3.5-flash-lite" in ids and "gemini-3.8-flash-lite-tts" in ids
    assert all(i.startswith("gemini-") for i in ids)


def test_the_probe_retires_after_winners_are_announced():
    assert not mo.retired(date(2026, 12, 22)) and mo.retired(date(2026, 12, 23))
