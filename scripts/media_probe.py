"""Daily check that drill media still expires: reads ops/storage (written on every run of deleteIncidentMedia,
every 5 minutes) through Firestore REST with the site's public API key, and exits 1 if the bucket lifecycle rule
is missing, the sweep has failed twice in a row, or its heartbeat is over 20 minutes old. With the CI debug token
(APPCHECK_DEBUG_TOKEN_CI) it sends an App Check token too, so the read keeps working once App Check is enforced on
Firestore; the token is never printed. Retires itself after 2026-12-22 (judging ends Dec 16; winners Dec 21).

Usage: python3 -I scripts/media_probe.py
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

SITE = "https://buildhybridai-2026-yg3m.web.app"
WEB_APP_ID = "1:593239421521:web:5aeaabe9c07bf3db587e70"  # public; init.json has no appId
STALE_MIN = 20  # four missed 5-minute runs
RETIRE_AFTER = date(2026, 12, 22)


def evaluate(d, now: datetime) -> list[str]:
    if d is None:
        return ["ops/storage is missing"]
    f = d.get("fields", {})
    problems = []
    if f.get("lifecycleOk", {}).get("booleanValue") is not True:
        problems.append("the bucket lifecycle rule is missing or too long")
    streak = int(f.get("sweepFailureStreak", {}).get("integerValue", "0"))
    if streak >= 2:
        problems.append(f"the media sweep failed on {streak} runs in a row")
    ts = f.get("checkedAt", {}).get("timestampValue")
    if not ts:
        problems.append("ops/storage has no checkedAt")
    else:
        checked = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        age_s = (now - checked).total_seconds()
        if age_s > STALE_MIN * 60:
            problems.append(f"the sweep last ran {age_s / 60:g} min ago (limit {STALE_MIN})")
    return problems


def ci_debug_token(env) -> str | None:
    """The CI App Check debug token from the environment, or None when it is not set."""
    return env.get("APPCHECK_DEBUG_TOKEN_CI") or None


def app_check_token(cfg: dict, debug: str) -> str:
    """Exchanges the debug token for an App Check token for the web app, from the hosting origin."""
    url = f"https://content-firebaseappcheck.googleapis.com/v1/projects/{cfg['projectId']}/apps/{WEB_APP_ID}:exchangeDebugToken?key={cfg['apiKey']}"
    req = urllib.request.Request(url, data=json.dumps({"debugToken": debug}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Referer": SITE + "/"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["token"]


def ops_storage_request(cfg: dict, app_check: str | None = None) -> urllib.request.Request:
    """The public ops/storage read, sent from the hosting origin: the browser API key accepts only its referrers."""
    url = f"https://firestore.googleapis.com/v1/projects/{cfg['projectId']}/databases/(default)/documents/ops/storage?key={cfg['apiKey']}"
    headers = {"Referer": SITE + "/"}
    if app_check:
        headers["X-Firebase-AppCheck"] = app_check
    return urllib.request.Request(url, headers=headers)


def main() -> int:
    now = datetime.now(timezone.utc)
    if now.date() > RETIRE_AFTER:
        print(f"media_probe: retired after {RETIRE_AFTER} (judging over); nothing checked")
        return 0
    with urllib.request.urlopen(SITE + "/__/firebase/init.json", timeout=30) as r:
        cfg = json.loads(r.read())
    debug = ci_debug_token(os.environ)
    token = app_check_token(cfg, debug) if debug else None
    print(f"media_probe: reading ops/storage {'with' if token else 'without'} an App Check token")
    try:
        with urllib.request.urlopen(ops_storage_request(cfg, token), timeout=30) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        d = None if e.code == 404 else {"fields": {}}
        print(f"media_probe: ops/storage read gave HTTP {e.code}")
    problems = evaluate(d, now)
    for p in problems:
        print(f"media_probe: FAIL: {p}")
    if not problems:
        print("media_probe: ok, the 30-day lifecycle rule is in place and the sweep ran recently")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
