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


def test_a_200_counts_only_with_a_non_empty_answer():
    ok = {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
    assert ac.answered(ok)
    for body in [{}, {"candidates": []}, {"candidates": [{"content": {"parts": [{"text": ""}]}}]}, {"candidates": [{"content": {}}]},
                 {"candidates": [{"content": {"parts": [{"text": None}]}}]}, {"candidates": [{"content": {"parts": [{"text": 5}]}}]}]:
        assert not ac.answered(body)


def test_the_debug_exchange_asks_for_a_limited_use_token():
    # Replay protection is enforced on AI Logic (2026-11-18), so only a limited-use token is accepted.
    assert ac.exchange_body("dbg") == {"debugToken": "dbg", "limitedUse": True}


def test_full_control_needs_the_same_token_refused_on_its_second_use():
    ok = {"no_token_status": 401, "no_token_refused": True, "first_status": 200, "first_answered": True, "replay_status": 401}
    assert ac.full_control_passed(**ok)
    assert not ac.full_control_passed(**{**ok, "replay_status": 200})
    assert not ac.full_control_passed(**{**ok, "first_answered": False})
    assert not ac.full_control_passed(**{**ok, "no_token_refused": False})
    assert not ac.full_control_passed(**{**ok, "replay_status": None})


def test_every_call_sends_the_hosting_origin_as_referer(monkeypatch):
    # The browser API key accepts only the hosting origins as referrers (pins existing behaviour).
    seen = {}

    class Resp:
        status = 200

        def read(self):
            return b"{}"

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake(req, timeout):
        seen["referer"] = req.get_header("Referer")
        return Resp()

    monkeypatch.setattr(ac.urllib.request, "urlopen", fake)
    ac.post("https://example.invalid/x", {}, {})
    assert seen["referer"] == "https://buildhybridai-2026-yg3m.web.app/"


def test_ci_mode_without_a_token_fails_loudly_and_calls_nothing(monkeypatch, capsys):
    # The repository secret exists (2026-11-18), so a missing token now means the secret was lost or renamed: the
    # positive read must fail rather than skip into a green run.
    def no_network(*a, **k):
        raise AssertionError("no network call may happen without a CI token")
    monkeypatch.setattr(ac.urllib.request, "urlopen", no_network)
    monkeypatch.delenv("APPCHECK_DEBUG_TOKEN_CI", raising=False)
    assert ac.main(["--ci"]) == 1
    assert "no CI token" in capsys.readouterr().out


def test_the_debug_token_comes_from_the_environment_in_ci_and_the_keychain_locally(monkeypatch):
    assert ac.debug_token(["--ci"], {"APPCHECK_DEBUG_TOKEN_CI": "ci-token"}) == "ci-token"
    assert ac.debug_token(["--ci"], {}) is None
    monkeypatch.setattr(ac.subprocess, "run", lambda *a, **k: ac.subprocess.CompletedProcess(a, 0, "keychain-token\n", ""))
    assert ac.debug_token([], {}) == "keychain-token"


def test_model_calls_carry_app_check_and_the_firebase_id_token():
    # AI Logic's authenticated-users mode (on since 2026-11-18) refuses a call without a Firebase Auth ID token.
    assert ac.model_headers("k", "ac", "idt") == {"x-goog-api-key": "k", "X-Firebase-AppCheck": "ac", "Authorization": "Firebase idt"}


def test_a_dispatch_can_point_the_probe_at_another_site_and_a_schedule_keeps_the_real_one(monkeypatch):
    # The wrong-URL control: a manual run with a wrong site must fail, which proves the probe can fail.
    def fresh():
        s = importlib.util.spec_from_file_location("ac_fresh", Path(__file__).with_name("appcheck_control.py"))
        m = importlib.util.module_from_spec(s)
        s.loader.exec_module(m)
        return m
    monkeypatch.setenv("PLS_SITE", "https://wrong-site.invalid")
    assert fresh().SITE == "https://wrong-site.invalid"
    monkeypatch.setenv("PLS_SITE", "")  # a scheduled run passes the empty input
    assert fresh().SITE == "https://buildhybridai-2026-yg3m.web.app"
    monkeypatch.delenv("PLS_SITE")
    assert fresh().SITE == "https://buildhybridai-2026-yg3m.web.app"
