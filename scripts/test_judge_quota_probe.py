"""Tests for the pure parts of scripts/judge_quota_probe.py (no network)."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("jq", Path(__file__).with_name("judge_quota_probe.py"))
jq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jq)
NOW = datetime(2026, 12, 2, 18, 30, tzinfo=timezone.utc)


def doc(count):
    return {"fields": {"count": {"integerValue": str(count)}}}


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


def test_a_failed_read_is_a_failure_and_404_is_an_empty_day():
    assert jq.read_outcome(404) == (None, [])
    assert jq.read_outcome(403) == (None, ["the counter read gave HTTP 403"])


def test_it_retires_after_judging():
    assert jq.retired(datetime(2026, 12, 17, 0, 0, tzinfo=timezone.utc)) is False
    assert jq.retired(datetime(2026, 12, 18, 0, 0, tzinfo=timezone.utc)) is True
