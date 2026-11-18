"""Daily, credential-free check that drill media still expires: reads ops/storage (written on every run of
deleteIncidentMedia, every 5 minutes) through Firestore REST with the site's public API key, and exits 1 if
the bucket lifecycle rule is missing, the sweep has failed twice in a row, or its heartbeat is over 20 minutes
old. Retires itself after 2026-12-17 (judging ends Dec 16).

Usage: python3 -I scripts/media_probe.py
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

SITE = "https://buildhybridai-2026-yg3m.web.app"
STALE_MIN = 20  # four missed 5-minute runs
RETIRE_AFTER = date(2026, 12, 17)


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


def ops_storage_request(cfg: dict) -> urllib.request.Request:
    """The public ops/storage read, sent from the hosting origin: the browser API key accepts only its referrers."""
    url = f"https://firestore.googleapis.com/v1/projects/{cfg['projectId']}/databases/(default)/documents/ops/storage?key={cfg['apiKey']}"
    return urllib.request.Request(url, headers={"Referer": SITE + "/"})


def main() -> int:
    now = datetime.now(timezone.utc)
    if now.date() > RETIRE_AFTER:
        print(f"media_probe: retired after {RETIRE_AFTER} (judging over); nothing checked")
        return 0
    with urllib.request.urlopen(SITE + "/__/firebase/init.json", timeout=30) as r:
        cfg = json.loads(r.read())
    try:
        with urllib.request.urlopen(ops_storage_request(cfg), timeout=30) as r:
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
