"""Tests for the pure parts of scripts/judge_quota_probe.py (no network)."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("jq", Path(__file__).with_name("judge_quota_probe.py"))
jq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jq)
NOW = datetime(2026, 12, 2, 18, 30, tzinfo=timezone.utc)


def doc(count, cap=None):
    f = {"count": {"integerValue": str(count)}}
    if cap is not None:
        f["cap"] = {"integerValue": str(cap)}
    return {"fields": f}


def test_the_cap_is_read_from_the_function_source_so_the_two_cannot_drift():
    assert jq.daily_cap() == 50
    assert jq.cap_from_source("export const JUDGE_SESSIONS_PER_DAY = 7;\n") == 7


def test_the_doc_is_the_current_utc_day():
    assert jq.doc_id(NOW) == "judgeSessions-2026-12-02"
    assert jq.doc_id(datetime(2026, 12, 2, 23, 59, tzinfo=timezone.utc)) == "judgeSessions-2026-12-02"


def test_ten_or_more_slots_left_pass_and_fewer_alarm():
    assert jq.evaluate(doc(40), 50) == (10, [])
    assert jq.evaluate(doc(41), 50) == (9, ["only 9 of 50 judge practice searches are left today (alarm below 10)"])
    assert jq.evaluate(doc(50), 50)[0] == 0


def test_no_doc_yet_means_none_used_today():
    assert jq.evaluate(None, 50) == (50, [])


def test_a_malformed_doc_is_a_failure_not_a_pass():
    assert jq.evaluate({"fields": {}}, 50)[1] == ["the day's count is missing or not a number"]
    assert jq.evaluate({"fields": {"count": {"stringValue": "x"}}}, 50)[1] == ["the day's count is missing or not a number"]


def test_the_lower_of_the_stored_and_checkout_caps_counts():
    # A lower cap deployed earlier today (stored with the count) is seen even when the checkout is higher.
    assert jq.evaluate(doc(40, cap=45), 50) == (5, ["only 5 of 45 judge practice searches are left today (alarm below 10)"])
    # A cap lowered today in the checkout is seen before the next start updates the stored one.
    assert jq.evaluate(doc(40, cap=50), 40) == (0, ["only 0 of 40 judge practice searches are left today (alarm below 10)"])
    assert jq.evaluate({"fields": {"count": {"integerValue": "1"}, "cap": {"stringValue": "x"}}}, 50)[1] == ["the day's cap is not a number"]


NAME = "projects/p/databases/(default)/documents/ops/judgeSessions-2026-12-02"


def test_only_a_batch_get_that_names_this_doc_missing_is_an_empty_day():
    assert jq.from_batch_get([{"missing": NAME, "readTime": "t"}], NAME) == (None, [])
    assert jq.from_batch_get([{"found": {"name": NAME, **doc(3)}, "readTime": "t"}], NAME) == ({"name": NAME, **doc(3)}, [])
    assert jq.from_batch_get([{"missing": NAME + "x"}], NAME)[1] == ["the counter read gave an unexpected reply"]
    assert jq.from_batch_get([], NAME)[1] == ["the counter read gave an unexpected reply"]
    assert jq.from_batch_get({"error": {"code": 404}}, NAME)[1] == ["the counter read gave an unexpected reply"]


def test_it_retires_after_winners_are_announced():
    assert jq.retired(datetime(2026, 12, 22, 23, 59, tzinfo=timezone.utc)) is False
    assert jq.retired(datetime(2026, 12, 23, 0, 0, tzinfo=timezone.utc)) is True
