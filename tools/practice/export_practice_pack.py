#!/usr/bin/env python3
"""The iPhone's practice drill, exported from the judge seed: shared/practice/ios-practice-pack.json.

A judge on the web gets a practice search copied from the seed drill (functions/src/judgeSession.ts). The iPhone app
ships the same search as one file, so a judge can open the searcher app without a code: the seed's incident settings
with the same overrides a practice search gets, its segments, its shared profile, and one plan (a web judge approves
plans as command; the phone has no command seat, so the pack carries the seed's latest plan at the seed's prior
version that no test wrote). Nothing else from the seed ships: no events, no command profile, no consent records, no
join code hashes and no user ids. Timestamps become epoch milliseconds, as the app's FirestoreJSON reads them.

Usage:
  python3 -I tools/practice/export_practice_pack.py --write   read the live seed and write the pack
  python3 -I tools/practice/export_practice_pack.py --check   read the live seed and compare with the committed pack
  python3 -I tools/practice/export_practice_pack.py           check the committed pack offline (the CI check)
Exit 0 ok, 1 a problem or a difference, 2 cannot read.
"""
import datetime
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/seed"))
import segment_contract  # noqa: E402

PROJECT = "buildhybridai-2026-yg3m"
PACK = ROOT / "shared/practice/ios-practice-pack.json"
SEED_FILE = ROOT / "shared/constants/judge-seed.json"
JUDGE_TS = ROOT / "functions/src/judgeSession.ts"
PROFILE_SCHEMA = ROOT / "shared/schemas/subject-profile.schema.json"
PLAN_SCHEMA = ROOT / "shared/schemas/plan.schema.json"
TEAM = "T1"
APPROVER = "practice-pack"  # the app decodes approvedByUid as a required string; no real uid ships
TEST_APPROVERS = {"push-test"}
MAX_BYTES = 1_000_000
# Fields the app reads from the incident (ios/PLS/Data/MissionBuilder.swift) and the seed's other settings a
# practice search inherits. Anything else on the seed (codes, setup fields, media stamps, times) never ships.
INCIDENT_FIELDS = {"conditions", "drillLabel", "engineParams", "gridAttribution", "gridId", "ipp", "ippSource", "mode",
                   "name", "plsTimeMs", "priorInputEventIds", "priorLayers", "priorModel", "priorSeed", "priorVersion",
                   "searchState", "status", "terrain"}
TOP_KEYS = {"packVersion", "provenance", "incidentId", "teamId", "incident", "segments", "plan", "sharedProfile"}


def judge_rules(ts: str) -> tuple[set[str], str]:
    """The seed fields a practice search never inherits, and its label, read from judgeSession.ts itself."""
    m = re.search(r"const NOT_COPIED = new Set\(\[(.*?)\]\)", ts, re.S)
    label = re.search(r'export const JUDGE_LABEL = "([^"]+)"', ts)
    if not m or not label:
        raise ValueError("judgeSession.ts: NOT_COPIED or JUDGE_LABEL not found")
    return set(re.findall(r'"([^"]+)"', m.group(1))), label.group(1)


def ms(iso: str) -> int:
    return int(datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def plain(v: dict):
    """A Firestore REST value as the app reads it: timestamps as epoch milliseconds."""
    kind, x = next(iter(v.items()))
    if kind == "integerValue":
        return int(x)
    if kind == "timestampValue":
        return ms(x)
    if kind == "mapValue":
        return {k: plain(f) for k, f in (x.get("fields") or {}).items()}
    if kind == "arrayValue":
        return [plain(i) for i in (x.get("values") or [])]
    if kind == "nullValue":
        return None
    if kind in ("stringValue", "booleanValue", "doubleValue"):
        return x
    raise ValueError(f"unsupported Firestore value {kind}")


def pick_plan(plans: dict[str, dict], prior_version) -> tuple[str, dict]:
    """The latest plan at the seed's prior version that no test wrote."""
    ok = {k: p for k, p in plans.items() if p.get("priorVersion") == prior_version and p.get("approvedByUid") not in TEST_APPROVERS}
    if not ok:
        raise ValueError(f"no plan at prior version {prior_version} outside the test plans")
    pid = max(ok, key=lambda k: ok[k]["version"])
    return pid, ok[pid]


def build(seed_id: str, incident: dict, segments: dict[str, dict], plans: dict[str, dict], shared: dict,
          ts: str, source: str, generated_at: str) -> dict:
    not_copied, label = judge_rules(ts)
    inc = {k: v for k, v in incident.items() if k not in not_copied and k in INCIDENT_FIELDS}
    inc.update({"name": "Practice search", "mode": "judge", "drillLabel": label, "status": "open", "priorInputEventIds": []})
    pid, plan = pick_plan(plans, incident.get("priorVersion"))
    plan = {**plan, "approvedByUid": APPROVER}
    return {
        "packVersion": 1,
        "provenance": {"tool": "tools/practice/export_practice_pack.py", "source": source, "sourceIncidentId": seed_id,
                       "planId": pid, "generatedAt": generated_at},
        "incidentId": seed_id,
        "teamId": TEAM,
        "incident": dict(sorted(inc.items())),
        "segments": [segments[k] for k in sorted(segments)],
        "plan": plan,
        "sharedProfile": shared,
    }


def problems(pack: dict, seed_id: str, ts: str) -> list[str]:
    """What the app or the pack's rules would refuse; empty when the pack is good."""
    out = []
    if set(pack) != TOP_KEYS:
        return [f"top-level keys differ: {sorted(set(pack) ^ TOP_KEYS)}"]
    not_copied, label = judge_rules(ts)
    if pack["packVersion"] != 1:
        out.append("packVersion is not 1")
    if pack["incidentId"] != seed_id or pack["provenance"].get("sourceIncidentId") != seed_id:
        out.append(f"not exported from the judge seed {seed_id}")
    if pack["teamId"] != TEAM:
        out.append(f"teamId is not {TEAM}")
    inc = pack["incident"]
    extra = set(inc) - INCIDENT_FIELDS
    if extra or set(inc) & not_copied - {"name", "mode", "drillLabel", "status", "priorInputEventIds"}:
        out.append(f"incident has fields that must not ship: {sorted(extra | (set(inc) & not_copied) - {'name', 'mode', 'drillLabel', 'status', 'priorInputEventIds'})}")
    want = {"name": "Practice search", "mode": "judge", "drillLabel": label, "status": "open", "priorInputEventIds": []}
    out += [f"incident {k} is {inc.get(k)!r}, not {v!r}" for k, v in want.items() if inc.get(k) != v]
    for k in ("gridId", "gridAttribution"):
        if not isinstance(inc.get(k), str) or not inc[k]:
            out.append(f"incident {k} is not a non-empty string")
    if not isinstance(inc.get("priorVersion"), int):
        out.append("incident priorVersion is not a whole number")
    if not isinstance(inc.get("engineParams"), dict):
        out.append("incident engineParams is not an object")
    segs = {s.get("segmentId"): s for s in pack["segments"]}
    out += [f"segment {p}" for p in segment_contract.check(segs, inc.get("priorVersion"))]
    plan = pack["plan"]
    plan_fields = set(json.loads(PLAN_SCHEMA.read_text())["properties"])
    if set(plan) - plan_fields:
        out.append(f"plan has unknown fields: {sorted(set(plan) - plan_fields)}")
    for k, t in (("version", int), ("priorVersion", int), ("basedOnEventSetHash", str), ("createdClientTimeMs", int)):
        if not isinstance(plan.get(k), t) or isinstance(plan.get(k), bool):
            out.append(f"plan {k} is not a {t.__name__}")
    if plan.get("approvedByUid") != APPROVER:
        out.append(f"plan approvedByUid is not {APPROVER!r}")
    if plan.get("priorVersion") != inc.get("priorVersion"):
        out.append("plan priorVersion is not the incident's")
    mine = [a for a in plan.get("assignments", []) if a.get("teamId") == TEAM]
    if len(mine) != 1:
        out.append(f"plan has {len(mine)} assignments for {TEAM}, not 1")
    for a in plan.get("assignments", []):
        if set(a) != {"teamId", "segmentIds", "taskText", "reason"} or not all(isinstance(a[k], str) for k in ("teamId", "taskText", "reason")):
            out.append(f"assignment {a.get('teamId')!r} is not {{teamId, segmentIds, taskText, reason}} with strings")
        elif not a["segmentIds"] or any(s not in segs for s in a["segmentIds"]):
            out.append(f"assignment {a['teamId']}: segmentIds are empty or name a segment not in the pack")
    schema = json.loads(PROFILE_SCHEMA.read_text())
    profile_fields = set(schema["$defs"]["SharedProfile"]["properties"])
    if not isinstance(pack["sharedProfile"], dict) or set(pack["sharedProfile"]) - profile_fields:
        out.append(f"sharedProfile has fields outside profile/shared: {sorted(set(pack['sharedProfile']) - profile_fields)}")
    text = json.dumps(pack)
    for k in re.findall(r'"([A-Za-z]*(?:[Uu]id|joinCode|JoinCode)[A-Za-z]*)":', text):
        if k != "approvedByUid":
            out.append(f"a field that must not ship: {k}")
    size = len((json.dumps(pack, indent=1, ensure_ascii=False) + "\n").encode())
    if size >= MAX_BYTES:
        out.append(f"the pack is {size} bytes, not under {MAX_BYTES}")
    return out


def read_live(project: str, seed_id: str) -> tuple[dict, dict, dict, dict]:
    tok = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
    if tok.returncode != 0 or not tok.stdout.strip():
        raise OSError("no gcloud access token (run gcloud auth login)")
    headers = {"Authorization": f"Bearer {tok.stdout.strip()}", "x-goog-user-project": project}
    base = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/incidents/{seed_id}"

    def get(url: str) -> dict:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
            return json.loads(r.read())

    def collection(name: str) -> dict[str, dict]:
        docs, page = {}, ""
        while True:
            r = get(f"{base}/{name}?pageSize=300" + (f"&pageToken={page}" if page else ""))
            for d in r.get("documents", []):
                docs[d["name"].rsplit("/", 1)[1]] = {k: plain(v) for k, v in d.get("fields", {}).items()}
            page = r.get("nextPageToken", "")
            if not page:
                return docs

    incident = {k: plain(v) for k, v in get(base).get("fields", {}).items()}
    shared = {k: plain(v) for k, v in get(f"{base}/profile/shared").get("fields", {}).items()}
    return incident, collection("segments"), collection("plans"), shared


def render(pack: dict) -> str:
    return json.dumps(pack, indent=1, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    seed_id = json.loads(SEED_FILE.read_text())["incidentId"]
    ts = JUDGE_TS.read_text()
    if not argv:
        if not PACK.exists():
            print(f"export_practice_pack: FAIL, {PACK.relative_to(ROOT)} is missing")
            return 1
        found = problems(json.loads(PACK.read_text()), seed_id, ts)
        for p in found:
            print(f"export_practice_pack: {p}")
        print("export_practice_pack: " + (f"FAIL, {len(found)} problem(s)" if found else "ok, the committed pack is readable and ships nothing private"))
        return 1 if found else 0
    if argv not in (["--write"], ["--check"]):
        print(__doc__.strip().splitlines()[-4])
        return 2
    try:
        incident, segments, plans, shared = read_live(PROJECT, seed_id)
    except (OSError, urllib.error.URLError, ValueError) as e:
        print(f"export_practice_pack: cannot read the seed {seed_id}: {e}")
        return 2
    if not segments:
        print(f"export_practice_pack: the seed {seed_id} has no segments; a pack that reads nothing proves nothing")
        return 2
    source = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or "unknown"
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pack = build(seed_id, incident, segments, plans, shared, ts, source, now)
    found = problems(pack, seed_id, ts)
    if found:
        for p in found:
            print(f"export_practice_pack: {p}")
        print(f"export_practice_pack: FAIL, the live seed does not make a good pack ({len(found)} problem(s)); nothing written")
        return 1
    if argv == ["--write"]:
        PACK.parent.mkdir(parents=True, exist_ok=True)
        PACK.write_text(render(pack))
        print(f"export_practice_pack: wrote {PACK.relative_to(ROOT)} ({len(render(pack).encode())} bytes, "
              f"{len(pack['segments'])} segments, plan {pack['provenance']['planId']})")
        return 0
    committed = json.loads(PACK.read_text())
    strip = lambda p: {**p, "provenance": {k: v for k, v in p["provenance"].items() if k not in ("generatedAt", "source")}}
    if strip(committed) != strip(pack):
        print("export_practice_pack: FAIL, the live seed has changed since the pack was written; run --write")
        return 1
    print("export_practice_pack: ok, the committed pack matches the live seed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
