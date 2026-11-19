"""Tests for the pure parts of scripts/media_probe.py (no network)."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("mp", Path(__file__).with_name("media_probe.py"))
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)
NOW = datetime(2026, 12, 12, 15, 0, tzinfo=timezone.utc)


def doc(ok=True, checked="2026-12-12T14:45:00Z"):
    f = {"lifecycleOk": {"booleanValue": ok}, "lifecycleAgeDays": {"integerValue": "30"}}
    if checked:
        f["checkedAt"] = {"timestampValue": checked}
    return {"fields": f}


def test_fresh_doc_with_the_rule_passes():
    assert mp.evaluate(doc(), NOW) == []


def test_a_missing_rule_a_stale_sweep_or_a_missing_doc_fails_with_a_reason():
    assert mp.evaluate(doc(ok=False), NOW) == ["the bucket lifecycle rule is missing or too long"]
    assert mp.evaluate(doc(checked="2026-12-12T14:35:00Z"), NOW) == ["the sweep last ran 25 min ago (limit 20)"]
    assert mp.evaluate(doc(checked=None), NOW) == ["ops/storage has no checkedAt"]
    assert mp.evaluate(None, NOW) == ["ops/storage is missing"]


def test_fractional_seconds_in_the_timestamp_parse():
    assert mp.evaluate(doc(checked="2026-12-12T14:59:59.123456Z"), NOW) == []


def test_staleness_compares_raw_seconds_not_rounded_minutes():
    # 20 min 30 s is past the 20-minute limit; flooring to whole minutes used to let it pass.
    assert mp.evaluate(doc(checked="2026-12-12T14:39:30Z"), NOW) == ["the sweep last ran 20.5 min ago (limit 20)"]
    assert mp.evaluate(doc(checked="2026-12-12T14:40:00Z"), NOW) == []


def test_two_failing_sweeps_in_a_row_fail_the_probe_one_does_not():
    one = doc(); one["fields"]["sweepFailureStreak"] = {"integerValue": "1"}
    two = doc(); two["fields"]["sweepFailureStreak"] = {"integerValue": "2"}
    assert mp.evaluate(one, NOW) == []
    assert mp.evaluate(two, NOW) == ["the media sweep failed on 2 runs in a row"]


def test_the_firestore_read_sends_the_hosting_origin_as_referer():
    # The browser API key is restricted to the hosting origins, so the probe's REST read must name one.
    req = mp.ops_storage_request({"projectId": "p", "apiKey": "k"})
    assert req.get_header("Referer") == "https://buildhybridai-2026-yg3m.web.app/"
    assert req.full_url.endswith("/projects/p/databases/(default)/documents/ops/storage?key=k")


def test_the_firestore_read_carries_an_app_check_token_when_it_has_one():
    # Review: under App Check enforcement on Firestore, a read without a token is refused.
    req = mp.ops_storage_request({"projectId": "p", "apiKey": "k"}, app_check="token-1")
    assert req.get_header("X-firebase-appcheck") == "token-1"
    assert mp.ops_storage_request({"projectId": "p", "apiKey": "k"}).get_header("X-firebase-appcheck") is None


def test_the_debug_token_comes_from_the_ci_secret_and_is_never_printed(monkeypatch, capsys):
    assert mp.ci_debug_token({"APPCHECK_DEBUG_TOKEN_CI": "secret-value"}) == "secret-value"
    assert mp.ci_debug_token({}) is None
    assert mp.ci_debug_token({"APPCHECK_DEBUG_TOKEN_CI": ""}) is None
    assert "secret-value" not in capsys.readouterr().out
