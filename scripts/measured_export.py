#!/usr/bin/env python3
"""Writes the judge page's Measured block: web/public/evidence/measured.json, every number computed from stored data.

- Where reads ran and how long the model took: the route record every report read stores on its event
  (incidents/{id}/events/{eventId}.route: path, latencyMs, platform). Every incident's events are read; an event
  copied into a judge sandbox keeps its id, so each event is counted once. A read on the iPhone's practice drill
  stays on the phone and is not counted. latencyMs is the model's answer time; rules reads use no model.
- Where plan wording ran and how long it took: the route record each approved plan stores
  (incidents/{id}/plans/{version}.wordingRoute). Plan ids repeat across incidents and a judge sandbox copies its
  seed's plans, so each distinct route record is counted once.
- What the cloud model cost: Firebase AI Logic's token counts in Cloud Monitoring, priced by scripts/ai_spend.py,
  from SPEND_SINCE to now.

The page refuses the file when it is old (web/src/judge/measured.ts). Usage (needs gcloud auth):
  python3 -I scripts/measured_export.py          write the file from live data
  python3 -I scripts/measured_export.py --check  check the committed file's shape (CI)
"""

import datetime as dt
import importlib.util
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/evidence/measured.json"
PROJECT = "buildhybridai-2026-yg3m"
SPEND_SINCE = dt.date(2026, 11, 13)  # the first cloud read of the build
SOURCE = {
    "reads": "route records on every stored report read (incidents/{id}/events/{eventId}.route), each event counted once",
    "wording": "route records of approved plans (incidents/{id}/plans/{version}.wordingRoute), each distinct record counted once",
    "spend": "Firebase AI Logic token counts in Cloud Monitoring, priced by scripts/ai_spend.py",
}


def median(xs: list[float]) -> float | None:
    s = sorted(xs)
    if not s:
        return None
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def _iso(ms: float) -> str:
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def route_key(r: dict) -> str:
    """A plan's wording route identifies itself: the same record copied into another incident has the same key."""
    return json.dumps(r, sort_keys=True)


def _once(rows: list[tuple[str, dict | None]]) -> dict[str, dict]:
    """The route of each event, once per event id; events with no route are not reads."""
    seen: dict[str, dict] = {}
    for event_id, r in rows:
        if isinstance(r, dict) and event_id not in seen:
            seen[event_id] = r
    return seen


def aggregate(rows: list[tuple[str, dict | None]]) -> dict:
    routes = list(_once(rows).values())
    by_path: dict[str, list[float]] = {"on_device": [], "cloud": [], "rules": [], "unknown": []}
    platforms: dict[str, dict[str, int]] = {}
    for r in routes:
        path = r.get("path") if r.get("path") in by_path else "unknown"
        ms = r.get("latencyMs")
        by_path[path].append(float(ms) if isinstance(ms, (int, float)) else 0.0)
        p = platforms.setdefault(str(r.get("platform")), {"onDevice": 0, "cloud": 0, "rules": 0})
        key = {"on_device": "onDevice", "cloud": "cloud", "rules": "rules"}.get(path)
        if key:
            p[key] += 1
    on, cl = by_path["on_device"], by_path["cloud"]
    model = len(on) + len(cl)
    return {
        "reads": len(routes),
        "onDevice": {"count": len(on), "medianMs": median(on)},
        "cloud": {"count": len(cl), "medianMs": median(cl)},
        "rules": len(by_path["rules"]),
        "unknown": len(by_path["unknown"]),
        "onDeviceShare": round(len(on) / model, 2) if model else None,
        "byPlatform": dict(sorted(platforms.items())),
    }


def window(rows: list[tuple[str, dict | None]]) -> dict:
    times = [r["decidedAtMs"] for r in _once(rows).values() if isinstance(r.get("decidedAtMs"), (int, float))]
    return {"from": _iso(min(times)), "to": _iso(max(times))} if times else {"from": None, "to": None}


def build(reads: dict, reads_win: dict, wording: dict, wording_win: dict, spend: dict, now: dt.datetime) -> dict:
    return {"schemaVersion": 1, "generatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": SOURCE,
            "window": reads_win, "reads": reads, "wordingWindow": wording_win, "wording": wording, "spend": spend}


def check(f: dict) -> list[str]:
    """What is wrong with a Measured file's shape; empty when the page can read it."""
    problems = []
    try:
        dt.datetime.strptime(f["generatedAt"], "%Y-%m-%dT%H:%M:%SZ")
    except (KeyError, TypeError, ValueError):
        problems.append("generatedAt is not a UTC time")
    for name in ("reads", "wording"):
        problems += _check_block(name, f.get(name))
    spend = f.get("spend")
    if not (isinstance(spend, dict) and all(isinstance(spend.get(k), (int, float)) for k in ("usd", "days", "usdPerDay"))):
        problems.append("spend has no usd, days and usdPerDay")
    if not (isinstance(f.get("source"), dict) and all(f["source"].get(k) for k in ("reads", "wording", "spend"))):
        problems.append("no source")
    return problems


def _check_block(name: str, b: object) -> list[str]:
    if not isinstance(b, dict):
        return [f"no {name}"]
    problems = [f"{name}.{k} is not a count" for k in ("reads", "rules", "unknown") if not isinstance(b.get(k), int)]
    for k in ("onDevice", "cloud"):
        v = b.get(k)
        if not (isinstance(v, dict) and isinstance(v.get("count"), int)
                and (v.get("medianMs") is None or isinstance(v.get("medianMs"), (int, float)))):
            problems.append(f"{name}.{k} is not a count and a median")
    share = b.get("onDeviceShare")
    if share is not None and not (isinstance(share, (int, float)) and 0 <= share <= 1):
        problems.append(f"{name}.onDeviceShare is not a share")
    return problems


def _token() -> str:
    return subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True).stdout.strip()


def read_routes(token: str, collection: str = "events", field: str = "route") -> list[tuple[str, dict | None]]:
    """Every incident's events (or plans), as (key, route), through a paged collection-group query. An event is keyed
    by its id; a plan's wording route by the record itself (route_key)."""
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents:runQuery"
    rows: list[tuple[str, dict | None]] = []
    after = None
    while True:
        q = {"from": [{"collectionId": collection, "allDescendants": True}], "select": {"fields": [{"fieldPath": field}]},
             "orderBy": [{"field": {"fieldPath": "__name__"}}], "limit": 500}
        if after:
            q["startAt"] = {"values": [{"referenceValue": after}], "before": False}
        req = urllib.request.Request(url, data=json.dumps({"structuredQuery": q}).encode(),
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        page = [x["document"] for x in json.loads(urllib.request.urlopen(req, timeout=60).read()) if "document" in x]
        for d in page:
            r = _route(d.get("fields", {}).get(field))
            rows.append((d["name"].rsplit("/", 1)[1] if collection == "events" else route_key(r or {}), r))
        if len(page) < 500:
            return rows
        after = page[-1]["name"]


def _route(v: dict | None) -> dict | None:
    if not v or "mapValue" not in v:
        return None
    out = {}
    for k, x in v["mapValue"].get("fields", {}).items():
        kind, val = next(iter(x.items()))
        out[k] = float(val) if kind in ("integerValue", "doubleValue") else val
    return out


def read_spend(token: str, now: dt.datetime) -> dict:
    spec = importlib.util.spec_from_file_location("ai_spend", ROOT / "scripts/ai_spend.py")
    s = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(s)
    headers = {"Authorization": f"Bearer {token}", "x-goog-user-project": PROJECT}
    since = dt.datetime.combine(SPEND_SINCE, dt.time(), dt.timezone.utc)
    usd = s.cost(s.read_tokens(headers, since, now))
    days = max(1, (now.date() - SPEND_SINCE).days)
    return {"from": SPEND_SINCE.isoformat(), "to": now.strftime("%Y-%m-%dT%H:%MZ"), "usd": round(usd, 4), "days": days,
            "usdPerDay": round(usd / days, 4)}


def main(argv: list[str]) -> int:
    if "--check" in argv:
        problems = check(json.loads(OUT.read_text()))
        for p in problems:
            print(f"measured_export: {p}")
        print("measured_export: ok" if not problems else "measured_export: FAIL")
        return 1 if problems else 0
    token = _token()
    if not token:
        print("measured_export: no gcloud access token; nothing written")
        return 2
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    rows = read_routes(token)
    plans = read_routes(token, "plans", "wordingRoute")
    f = build(aggregate(rows), window(rows), aggregate(plans), window(plans), read_spend(token, now), now)
    problems = check(f)
    if problems:
        print(f"measured_export: refused to write: {problems}")
        return 1
    OUT.write_text(json.dumps(f, indent=2) + "\n")
    r, w = f["reads"], f["wording"]
    print(f"measured_export: wrote {OUT.relative_to(ROOT)}: {r['reads']} reads ({r['onDevice']['count']} on device, "
          f"{r['cloud']['count']} cloud, {r['rules']} rules); {w['reads']} plan wordings ({w['onDevice']['count']} on "
          f"device, {w['cloud']['count']} cloud, {w['rules']} rules); ${f['spend']['usd']} over {f['spend']['days']} days")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
