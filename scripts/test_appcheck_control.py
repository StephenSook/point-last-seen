"""Tests for the pure parts of scripts/appcheck_control.py (no network)."""

import importlib.util
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location("ac", Path(__file__).with_name("appcheck_control.py"))
ac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ac)


def test_full_control_passes_only_on_401_then_200():
    assert ac.control_passed(401, 200)
    for a, b in [(200, 200), (401, 403), (401, None), (403, 200), (None, None)]:
        assert not ac.control_passed(a, b)


def test_no_token_refusal_must_be_the_app_check_refusal():
    good = {"error": {"status": "UNAUTHENTICATED", "message": "Firebase App Check token is invalid."}}
    assert ac.refused_for_app_check(401, good)
    assert not ac.refused_for_app_check(401, {"error": {"status": "UNAUTHENTICATED", "message": "API key not valid."}})
    assert not ac.refused_for_app_check(403, good)
    assert not ac.refused_for_app_check(200, {})


def test_redact_removes_every_secret_occurrence():
    assert ac.redact('{"k":"AIzaSECRET","t":"tok","x":"AIzaSECRET"}', ["AIzaSECRET", "tok", ""]) == '{"k":"<REDACTED>","t":"<REDACTED>","x":"<REDACTED>"}'


def test_config_comes_from_hosting_init_json():
    # The deployed init.json carries the key and project but no appId (measured 2026-11-18).
    cfg = ac.config_from_init({"apiKey": "k", "projectId": "p", "authDomain": "a", "storageBucket": "b"})
    assert cfg == {"apiKey": "k", "projectId": "p"}


def test_the_daily_probe_retires_after_judging():
    assert not ac.retired(date(2026, 12, 16))
    assert ac.retired(date(2026, 12, 18))
