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
    assert mp.evaluate(doc(checked="2026-12-12T12:30:00Z"), NOW) == ["the sweep last ran 150 min ago (limit 120)"]
    assert mp.evaluate(doc(checked=None), NOW) == ["ops/storage has no checkedAt"]
    assert mp.evaluate(None, NOW) == ["ops/storage is missing"]


def test_fractional_seconds_in_the_timestamp_parse():
    assert mp.evaluate(doc(checked="2026-12-12T14:59:59.123456Z"), NOW) == []


def test_staleness_compares_raw_seconds_not_rounded_minutes():
    # 120 min 30 s is past the 120-minute limit; flooring to whole minutes used to let it pass.
    assert mp.evaluate(doc(checked="2026-12-12T12:59:30Z"), NOW) == ["the sweep last ran 120.5 min ago (limit 120)"]
    assert mp.evaluate(doc(checked="2026-12-12T13:00:00Z"), NOW) == []
