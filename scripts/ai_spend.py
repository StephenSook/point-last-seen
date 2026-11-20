#!/usr/bin/env python3
"""What the cloud model has cost so far, per practice search, against the $25 Gemini budget.

Reads Firebase AI Logic's token counts (Cloud Monitoring, firebasevertexai.googleapis.com/model/gen_ai_client_token_usage)
and the practice searches started (ops/judgeSessions-{YYYY-MM-DD}) since a start day, prices the tokens at the Gemini
Developer API paid rates (the apps use GoogleAIBackend), and projects the cost of a week at the daily sandbox cap.

Every token in the window is charged to the practice searches, including tests and drills, so the cost per search is an
upper bound. A model with no price below fails the run: add its price (with the page it came from) before trusting it.

Usage: python3 -I scripts/ai_spend.py [--since YYYY-MM-DD]   (default: 7 days ago; needs gcloud auth)
Exit 0 the projected week fits the budget, 1 it does not or a model has no price, 2 cannot read.
"""
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT, PROJECT_NUMBER = "buildhybridai-2026-yg3m", "593239421521"
BUDGET_USD = 25.0
DAILY_CAP = 50  # JUDGE_SESSIONS_PER_DAY in functions/src/judgeSession.ts
DAYS = 7
# USD per 1M tokens, standard paid tier. Source: https://aistudio.google.com/docs/pricing, read 2026-11-20.
PRICES = {
    ("gemini-3.5-flash-lite", "input"): 0.30,
    ("gemini-3.5-flash-lite", "output"): 2.50,
    ("gemini-3.8-flash-lite-tts", "input"): 0.50,   # through 2026-12-31, then 1.00
    ("gemini-3.8-flash-lite-tts", "output"): 6.00,  # audio; through 2026-12-31, then 12.00
}


def cost(tokens: dict[tuple[str, str], int]) -> float:
    """USD for {(model, "input"|"output"): tokens}; a model or type with no price raises KeyError."""
    return sum(n * PRICES[key] / 1_000_000 for key, n in tokens.items() if n)


def projection(total_usd: float, sessions: int, cap: int = DAILY_CAP, days: int = DAYS) -> dict:
    """Cost per practice search (all spend charged to them) and a week at the daily cap."""
    per = total_usd / sessions if sessions else None
    week = per * cap * days if per is not None else None
    return {"usd": total_usd, "sessions": sessions, "usdPerSession": per, "weekAtCapUsd": week,
            "fits": week is not None and week < BUDGET_USD}


def _get(url: str, headers: dict, body: bytes | None = None) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=60) as r:
        return json.loads(r.read())


def read_tokens(headers: dict, since: datetime.datetime, until: datetime.datetime) -> dict[tuple[str, str], int]:
    out: dict[tuple[str, str], int] = {}
    q = urllib.parse.urlencode({
        "filter": 'metric.type="firebasevertexai.googleapis.com/model/gen_ai_client_token_usage"',
        "interval.startTime": since.strftime("%Y-%m-%dT%H:%M:%SZ"), "interval.endTime": until.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "aggregation.alignmentPeriod": "3600s", "aggregation.perSeriesAligner": "ALIGN_SUM",
        "aggregation.crossSeriesReducer": "REDUCE_SUM",
        "aggregation.groupByFields": ["metric.label.gen_ai_response_model", "metric.label.gen_ai_token_type"]}, doseq=True)
    for s in _get(f"https://monitoring.googleapis.com/v3/projects/{PROJECT_NUMBER}/timeSeries?{q}", headers).get("timeSeries", []):
        m = s["metric"]["labels"]
        key = (m.get("gen_ai_response_model", "?"), m.get("gen_ai_token_type", "?"))
        # Count only buckets that start inside the window: an aligned bucket can reach back before it.
        n = sum(int(p["value"].get("int64Value", 0)) for p in s["points"] if p["interval"]["startTime"] >= since.strftime("%Y-%m-%dT%H:%M:%S"))
        out[key] = out.get(key, 0) + n
    return out


def read_sessions(headers: dict, since: datetime.date, until: datetime.date) -> int:
    total, day = 0, since
    while day <= until:
        url = (f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/ops/"
               f"judgeSessions-{day.isoformat()}")
        try:
            total += int(_get(url, headers).get("fields", {}).get("count", {}).get("integerValue", 0))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
        day += datetime.timedelta(days=1)
    return total


def main(argv: list[str]) -> int:
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    if argv[:1] == ["--since"] and len(argv) == 2:
        since = datetime.datetime.fromisoformat(argv[1]).replace(tzinfo=datetime.timezone.utc)
    elif not argv:
        since = (now - datetime.timedelta(days=7)).replace(hour=0, minute=0, second=0)
    else:
        print(__doc__.strip().splitlines()[-2])
        return 2
    tok = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
    if tok.returncode != 0 or not tok.stdout.strip():
        print("ai_spend: no gcloud access token (run gcloud auth login)")
        return 2
    headers = {"Authorization": f"Bearer {tok.stdout.strip()}", "x-goog-user-project": PROJECT}
    try:
        tokens = read_tokens(headers, since, now)
        sessions = read_sessions(headers, since.date(), now.date())
    except (OSError, urllib.error.URLError, ValueError) as e:
        print(f"ai_spend: cannot read: {e}")
        return 2
    for (model, kind), n in sorted(tokens.items()):
        print(f"ai_spend: {model} {kind}: {n:,} tokens")
    try:
        usd = cost(tokens)
    except KeyError as e:
        print(f"ai_spend: FAIL, no price for {e.args[0]}; add it to PRICES with its source")
        return 1
    p = projection(usd, sessions)
    print(f"ai_spend: {since:%Y-%m-%d} to {now:%Y-%m-%dT%H:%MZ}: ${usd:.4f} for all cloud reads; {sessions} practice "
          f"searches started")
    if p["usdPerSession"] is None:
        print("ai_spend: no practice searches in the window, so no cost per search; nothing to project")
        return 0
    print(f"ai_spend: at most ${p['usdPerSession']:.4f} per practice search (all spend charged to them); a week at "
          f"the cap of {DAILY_CAP} a day: ${p['weekAtCapUsd']:.2f} against ${BUDGET_USD:.0f}: "
          + ("fits" if p["fits"] else "DOES NOT FIT, lower JUDGE_SESSIONS_PER_DAY"))
    return 0 if p["fits"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
