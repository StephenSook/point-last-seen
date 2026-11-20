#!/usr/bin/env python3
"""The judge drill (drill-judge-1): the shared drill judges join from the phone apps with the judges' codes.

It tells the same story as a judge's practice search on the web and the iPhone practice pack: it is built from the
judge seed (shared/constants/judge-seed.json): the seed's incident settings (the fields judgeSession.ts copies), its
segments, teams and shared profile, and the plan the practice pack carries (the seed's latest plan at its prior
version that no test wrote). It stays a training drill: mode "drill", the drill label, "Judge drill" in its name.
Values are copied as Firestore stores them, so times and numbers keep their types.

Usage (python3 -I, gcloud user's token; every command is for drill-judge-1 only):
  tools/practice/judge_drill.py --check           compare the drill's baseline docs with the seed; list what judges added
  tools/practice/judge_drill.py --write           write the baseline docs (after seed_drill.py made the incident)
  tools/practice/judge_drill.py --reset           dry run: list what a reset would delete
  tools/practice/judge_drill.py --reset --yes     delete everything judges added (docs and media), then --write
Run --reset only on demand, never on a schedule, and never between 2026-12-10 and 2026-12-16 (judging).
Exit 0 ok, 1 a difference or a refusal, 2 cannot read.
"""
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/practice"))
sys.path.insert(0, str(ROOT / "tools/seed"))
import export_practice_pack as pack  # noqa: E402
import seed_drill  # noqa: E402

PROJECT = "buildhybridai-2026-yg3m"
BUCKET = f"{PROJECT}.firebasestorage.app"
DRILL = "drill-judge-1"
NAME = "Judge drill (training; nobody is missing)"
BASELINE_APPROVER = "judge-drill-baseline"  # a fixed string in approvedByUid, never a person's uid
MEDIA_PREFIXES = ("clips", "photos", "packs")
JUDGING = (datetime.date(2026, 12, 10), datetime.date(2026, 12, 16))
DOCS = f"projects/{PROJECT}/databases/(default)/documents"


def s(v: str) -> dict:
    return {"stringValue": v}


def baseline(seed: dict, ts: str) -> dict[str, dict]:
    """{doc path under incidents/drill-judge-1 ("" for the incident): raw Firestore fields} from the seed's raw docs."""
    not_copied, _ = pack.judge_rules(ts)
    inc = {k: v for k, v in seed["incident"].items() if k not in not_copied and k in pack.INCIDENT_FIELDS}
    inc.update({"name": s(NAME), "mode": s("drill"), "drillLabel": s(seed_drill.DRILL_LABEL), "status": s("open"),
                "priorInputEventIds": {"arrayValue": {}}})
    plain_plans = {k: {f: pack.plain(v) for f, v in p.items()} for k, p in seed["plans"].items()}
    prior = pack.plain(seed["incident"]["priorVersion"]) if "priorVersion" in seed["incident"] else None
    pid, _ = pack.pick_plan(plain_plans, prior)
    plan = {**seed["plans"][pid], "approvedByUid": s(BASELINE_APPROVER)}
    out = {"": inc, "profile/shared": seed["shared"], f"plans/{pid}": plan}
    out.update({f"segments/{k}": v for k, v in seed["segments"].items()})
    out.update({f"teams/{k}": v for k, v in seed["teams"].items()})
    return out


def differences(want: dict[str, dict], have: dict[str, dict]) -> list[str]:
    """Baseline docs that are missing or differ on the drill (incident: only the baseline's own fields)."""
    out = []
    for path in sorted(want):
        got = have.get(path)
        if got is None:
            out.append(f"{path or 'incident'}: missing")
            continue
        fields = want[path]
        mine = {k: got.get(k) for k in fields} if path == "" else got
        if path != "" and "createdAt" in mine and "createdAt" not in fields:
            mine = {k: v for k, v in mine.items() if k != "createdAt"}
        if mine != fields:
            keys = sorted(k for k in set(fields) | set(mine) if fields.get(k) != mine.get(k))
            out.append(f"{path or 'incident'}: differs in {keys[:8]}")
    return out


def reset_refused(today: datetime.date, drill: str) -> str | None:
    if drill != DRILL:
        return f"refused: the reset is for {DRILL} only"
    if JUDGING[0] <= today <= JUDGING[1]:
        return f"refused: no reset during judging ({JUDGING[0]} to {JUDGING[1]})"
    return None


class Api:
    def __init__(self) -> None:
        tok = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
        if tok.returncode != 0 or not tok.stdout.strip():
            raise OSError("no gcloud access token (run gcloud auth login)")
        self.h = {"Authorization": f"Bearer {tok.stdout.strip()}", "x-goog-user-project": PROJECT,
                  "Content-Type": "application/json"}

    def call(self, url: str, body: dict | None = None, method: str | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=self.h, method=method), timeout=60) as r:
            raw = r.read()
        return json.loads(raw) if raw else {}

    def doc(self, path: str) -> dict | None:
        try:
            return self.call(f"https://firestore.googleapis.com/v1/{DOCS}/{path}").get("fields", {})
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def collection(self, path: str) -> dict[str, dict]:
        docs, page = {}, ""
        while True:
            r = self.call(f"https://firestore.googleapis.com/v1/{DOCS}/{path}?pageSize=300" + (f"&pageToken={page}" if page else ""))
            for d in r.get("documents", []):
                docs[d["name"].rsplit("/", 1)[1]] = d.get("fields", {})
            page = r.get("nextPageToken", "")
            if not page:
                return docs

    def subcollections(self, path: str) -> list[str]:
        r = self.call(f"https://firestore.googleapis.com/v1/{DOCS}/{path}:listCollectionIds", {"pageSize": 100}, "POST")
        return r.get("collectionIds", [])

    def all_docs(self, path: str, depth: int = 0) -> list[str]:
        """Every doc path under a doc, through nested collections (team devices and their measurements)."""
        if depth > 4:
            raise ValueError(f"nesting deeper than 4 under {path}")
        out = []
        for c in self.subcollections(path):
            for d in self.collection(f"{path}/{c}"):
                out.append(f"{path}/{c}/{d}")
                out += self.all_docs(f"{path}/{c}/{d}", depth + 1)
        return out

    def media(self, drill: str) -> list[str]:
        names = []
        for prefix in MEDIA_PREFIXES:
            page = ""
            while True:
                q = urllib.parse.urlencode({"prefix": f"{prefix}/{drill}/", **({"pageToken": page} if page else {})})
                r = self.call(f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o?{q}")
                names += [o["name"] for o in r.get("items", [])]
                page = r.get("nextPageToken", "")
                if not page:
                    break
        return names


def read_seed(api: Api, seed_id: str) -> dict:
    base = f"incidents/{seed_id}"
    return {"incident": api.doc(base) or {}, "segments": api.collection(f"{base}/segments"), "plans": api.collection(f"{base}/plans"),
            "teams": api.collection(f"{base}/teams"), "shared": api.doc(f"{base}/profile/shared") or {}}


def read_drill(api: Api, want: dict[str, dict]) -> dict[str, dict]:
    base = f"incidents/{DRILL}"
    have: dict[str, dict] = {}
    inc = api.doc(base)
    if inc is not None:
        have[""] = inc
    for sub in ("segments", "teams", "plans"):
        have.update({f"{sub}/{k}": v for k, v in api.collection(f"{base}/{sub}").items()})
    shared = api.doc(f"{base}/profile/shared")
    if shared is not None:
        have["profile/shared"] = shared
    return have


def write_baseline(api: Api, want: dict[str, dict]) -> None:
    base = f"{DOCS}/incidents/{DRILL}"
    writes = []
    for path, fields in want.items():
        name = base if path == "" else f"{base}/{path}"
        w = {"update": {"name": name, "fields": fields}, "currentDocument": {"exists": True}} if path == "" else \
            {"update": {"name": name, "fields": fields}}
        if path == "":
            w["updateMask"] = {"fieldPaths": sorted(fields)}
        writes.append(w)
    for i in range(0, len(writes), 400):
        api.call(f"https://firestore.googleapis.com/v1/{DOCS}:commit", {"writes": writes[i:i + 400]}, "POST")


def main(argv: list[str]) -> int:
    seed_id = json.loads(pack.SEED_FILE.read_text())["incidentId"]
    ts = pack.JUDGE_TS.read_text()
    if argv not in (["--check"], ["--write"], ["--reset"], ["--reset", "--yes"]):
        print(__doc__.strip())
        return 2
    try:
        api = Api()
        seed = read_seed(api, seed_id)
        if not seed["segments"]:
            print(f"judge_drill: the seed {seed_id} has no segments; refusing to build from nothing")
            return 2
        want = baseline(seed, ts)
        if argv == ["--check"]:
            found = differences(want, read_drill(api, want))
            extra = [p for p in api.all_docs(f"incidents/{DRILL}") if p.split(f"incidents/{DRILL}/", 1)[1] not in want]
            for p in found:
                print(f"judge_drill: {p}")
            print(f"judge_drill: {len(extra)} docs added by judges since the baseline (events, answers, devices, media records)")
            print("judge_drill: " + (f"FAIL, {len(found)} baseline doc(s) differ from the seed" if found else
                                     f"ok, {DRILL}'s {len(want)} baseline docs match the seed {seed_id}"))
            return 1 if found else 0
        if argv == ["--write"]:
            if api.doc(f"incidents/{DRILL}") is None:
                print(f"judge_drill: {DRILL} does not exist; create it first with tools/seed/seed_drill.py")
                return 1
            write_baseline(api, want)
            print(f"judge_drill: wrote {len(want)} baseline docs to {DRILL} from the seed {seed_id}")
            return 0
        refused = reset_refused(datetime.datetime.now(datetime.timezone.utc).date(), DRILL)
        if refused:
            print(f"judge_drill: {refused}")
            return 1
        docs = [p for p in api.all_docs(f"incidents/{DRILL}") if p.split(f"incidents/{DRILL}/", 1)[1] not in want]
        media = api.media(DRILL)
        print(f"judge_drill: a reset deletes {len(docs)} docs judges added and {len(media)} media files, then rewrites "
              f"the {len(want)} baseline docs")
        if argv == ["--reset"]:
            print("judge_drill: dry run; add --yes to reset")
            return 0
        for i in range(0, len(docs), 400):
            api.call(f"https://firestore.googleapis.com/v1/{DOCS}:commit",
                     {"writes": [{"delete": f"{DOCS}/{p}"} for p in docs[i:i + 400]]}, "POST")
        for name in media:
            api.call(f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{urllib.parse.quote(name, safe='')}", method="DELETE")
        write_baseline(api, want)
        found = differences(want, read_drill(api, want))
        print(f"judge_drill: reset done; deleted {len(docs)} docs and {len(media)} media files; "
              + ("baseline matches" if not found else f"FAIL, {len(found)} baseline docs still differ"))
        return 1 if found else 0
    except (OSError, urllib.error.URLError, ValueError) as e:
        print(f"judge_drill: cannot read or write: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
