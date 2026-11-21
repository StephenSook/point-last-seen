"""Hourly check of the judges' practice quota: reads today's count of judge practice searches
(ops/judgeSessions-YYYY-MM-DD, UTC, written by startJudgeSession) through Firestore REST with the site's public API
key, and exits 1 when fewer than 10 of the day's searches are left, so the team hears before a judge is refused. It
never starts a session. With the CI debug token (APPCHECK_DEBUG_TOKEN_CI) it sends an App Check token, since App
Check is enforced on Firestore; the token is never printed. The day's cap is read from functions/src/judgeSession.ts.
A failed read is a failure, never a pass. Retires itself after 2026-12-17 (judging ends Dec 16).

Usage: python3 -I scripts/judge_quota_probe.py
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

SITE = "https://buildhybridai-2026-yg3m.web.app"
WEB_APP_ID = "1:593239421521:web:5aeaabe9c07bf3db587e70"  # public; init.json has no appId
MIN_LEFT = 10
RETIRE_AFTER = date(2026, 12, 17)
SOURCE = Path(__file__).resolve().parents[1] / "functions/src/judgeSession.ts"


def cap_from_source(text: str) -> int:
    m = re.search(r"export const JUDGE_SESSIONS_PER_DAY = (\d+);", text)
    if not m:
        raise SystemExit("judge_quota_probe: JUDGE_SESSIONS_PER_DAY not found in judgeSession.ts")
    return int(m.group(1))


def daily_cap() -> int:
    return cap_from_source(SOURCE.read_text())


def doc_id(now: datetime) -> str:
    return f"judgeSessions-{now.astimezone(timezone.utc).date().isoformat()}"


def retired(now: datetime) -> bool:
    return now.date() > RETIRE_AFTER


def evaluate(d, cap: int) -> tuple[int, list[str]]:
    """Searches left today and the problems: none used when there is no doc yet."""
    if d is None:
        return cap, []
    raw = d.get("fields", {}).get("count", {}).get("integerValue")
    if raw is None or not str(raw).isdigit():
        return 0, ["the day's count is missing or not a number"]
    left = max(cap - int(raw), 0)
    return left, ([] if left >= MIN_LEFT else [f"only {left} of {cap} judge practice searches are left today (alarm below {MIN_LEFT})"])


def read_outcome(code: int):
    """A 404 is a day with no search yet; any other error is a failed check."""
    return (None, []) if code == 404 else (None, [f"the counter read gave HTTP {code}"])


def app_check_token(cfg: dict, debug: str) -> str:
    """Exchanges the debug token for an App Check token for the web app, from the hosting origin."""
    url = f"https://content-firebaseappcheck.googleapis.com/v1/projects/{cfg['projectId']}/apps/{WEB_APP_ID}:exchangeDebugToken?key={cfg['apiKey']}"
    req = urllib.request.Request(url, data=json.dumps({"debugToken": debug}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Referer": SITE + "/"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["token"]


def main() -> int:
    now = datetime.now(timezone.utc)
    if retired(now):
        print(f"judge_quota_probe: retired after {RETIRE_AFTER} (judging over); nothing checked")
        return 0
    cap = daily_cap()
    with urllib.request.urlopen(SITE + "/__/firebase/init.json", timeout=30) as r:
        cfg = json.loads(r.read())
    debug = os.environ.get("APPCHECK_DEBUG_TOKEN_CI") or None
    headers = {"Referer": SITE + "/"}
    if debug:
        headers["X-Firebase-AppCheck"] = app_check_token(cfg, debug)
    name = doc_id(now)
    url = f"https://firestore.googleapis.com/v1/projects/{cfg['projectId']}/databases/(default)/documents/ops/{name}?key={cfg['apiKey']}"
    print(f"judge_quota_probe: reading ops/{name} {'with' if debug else 'without'} an App Check token")
    problems: list[str] = []
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
            left, problems = evaluate(json.loads(r.read()), cap)
    except urllib.error.HTTPError as e:
        d, problems = read_outcome(e.code)
        left = cap if not problems else 0
    for p in problems:
        print(f"judge_quota_probe: FAIL: {p}")
    if not problems:
        print(f"judge_quota_probe: ok, {left} of {cap} judge practice searches left today")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
