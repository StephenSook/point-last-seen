#!/usr/bin/env python3
"""The judge drill (drill-judge-1): the shared drill judges join from the phone apps with the judges' codes.

It tells the same story as a judge's practice search on the web and the iPhone practice pack: it is built from the
judge seed (shared/constants/judge-seed.json): the seed's incident settings (the fields judgeSession.ts copies), its
segments, teams and shared profile, and the plan the practice pack carries (the seed's latest plan at its prior
version that no test wrote). It stays a training drill: mode "drill", the drill label, "Judge drill" in its name.
Values are copied as Firestore stores them, so times and numbers keep their types. A seed that fails the segment
contract or has no shared profile is refused before anything is written.

Usage (python3 -I, gcloud user's token; every command is for drill-judge-1 only):
  tools/practice/judge_drill.py --check           compare the drill with the seed (a leftover plan or incident field
                                                  counts); list how many docs judges added
  tools/practice/judge_drill.py --write           write the baseline docs (after seed_drill.py made the incident)
  tools/practice/judge_drill.py --reset           dry run: list what a reset would delete
  tools/practice/judge_drill.py --reset --yes     rewrite the baseline first, then delete everything judges added
                                                  (docs, through nested collections, and their media)
Run --reset only on demand, never on a schedule, and never between 2026-12-10 and 2026-12-16 (judging). A reset
that stops part way leaves the baseline in place; run it again.
Exit 0 ok, 1 a difference or a refusal, 2 cannot read or the seed is incomplete.
"""
import datetime
import json
import math
import re
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
import segment_contract  # noqa: E402

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


def doc_url(path: str) -> str:
    """A doc or collection URL with every id quoted, so a "#" or "?" in an id stays in the path."""
    return f"https://firestore.googleapis.com/v1/{DOCS}/{urllib.parse.quote(path, safe='/')}"


def baseline(seed: dict, ts: str) -> dict[str, dict]:
    """{doc path under incidents/drill-judge-1 ("" for the incident): raw Firestore fields} from the seed's raw docs.

    Raises ValueError when the seed is incomplete: its segments fail the apps' contract (no ROW, a prior that does not
    sum to 1, a missing field) or it has no shared profile."""
    if not seed.get("shared"):
        raise ValueError("the seed has no profile/shared")
    inc_raw = seed["incident"]
    for k, kind in (("gridId", "stringValue"), ("gridAttribution", "stringValue"), ("priorVersion", "integerValue"),
                    ("engineParams", "mapValue")):
        if kind not in inc_raw.get(k, {}) or inc_raw[k][kind] in ("", None):
            raise ValueError(f"the seed incident has no {k}")
    prior = pack.plain(inc_raw["priorVersion"])
    problems = raw_segment_problems(seed["segments"])
    plain_segs = {k: {f: pack.plain(v) for f, v in d.items()} for k, d in seed["segments"].items()}
    problems += segment_contract.check(plain_segs, prior)
    if problems:
        raise ValueError(f"the seed's segments fail the contract: {problems[:3]}")
    not_copied, _ = pack.judge_rules(ts)
    inc = {k: v for k, v in seed["incident"].items() if k not in not_copied and k in pack.INCIDENT_FIELDS}
    inc.update({"name": s(NAME), "mode": s("drill"), "drillLabel": s(seed_drill.DRILL_LABEL), "status": s("open"),
                "priorInputEventIds": {"arrayValue": {}}})
    plain_plans = {k: {f: pack.plain(v) for f, v in p.items()} for k, p in seed["plans"].items()}
    pid, chosen = pack.pick_plan(plain_plans, prior)
    for a in chosen.get("assignments", []):
        if a.get("teamId") not in seed["teams"]:
            raise ValueError(f"the seed's plan {pid} assigns team {a.get('teamId')!r}, which the seed does not have")
        if any(sid not in seed["segments"] for sid in a.get("segmentIds", [])):
            raise ValueError(f"the seed's plan {pid} names a segment the seed does not have")
    plan = {**seed["plans"][pid], "approvedByUid": s(BASELINE_APPROVER)}
    out = {"": inc, "profile/shared": seed["shared"], f"plans/{pid}": plan}
    out.update({f"segments/{k}": v for k, v in seed["segments"].items()})
    out.update({f"teams/{k}": v for k, v in seed["teams"].items()})
    return out


NUMBER_KINDS = ("integerValue", "doubleValue")


def _number(raw: dict | None) -> bool:
    return isinstance(raw, dict) and any(k in raw for k in NUMBER_KINDS)


def _positions_ok(coords, depth: int) -> bool:
    """A GeoJSON coordinates array at the given nesting depth whose positions are finite [number, number, ...] and
    whose rings (depth 1) hold at least 4 positions, as a closed linear ring must."""
    if not isinstance(coords, list) or not coords:
        return False
    if depth == 0:
        return len(coords) >= 2 and all(isinstance(c, (int, float)) and not isinstance(c, bool) and math.isfinite(c)
                                         for c in coords)
    if depth == 1 and len(coords) < 4:
        return False
    return all(_positions_ok(c, depth - 1) for c in coords)


def raw_segment_problems(segments: dict[str, dict]) -> list[str]:
    """What the contract check cannot see after plain(): numbers stored as Firestore numbers (a timestamp is not
    one), and polygons whose positions are number pairs, as the apps parse them."""
    out = []
    for sid, f in sorted(segments.items()):
        numeric = ("priorPoa", "priorVersion") if sid == "ROW" else ("priorPoa", "priorVersion", "ringPoa", "areaM2", "nearFrac")
        out += [f"{sid}: {k} is not stored as a number" for k in numeric if not _number(f.get(k))]
        if sid == "ROW":
            continue
        c = f.get("centroid", {}).get("mapValue", {}).get("fields", {})
        if not (_number(c.get("lat")) and _number(c.get("lon"))):
            out.append(f"{sid}: centroid lat and lon are not stored as numbers")
        try:
            geom = json.loads(f.get("geometryJson", {}).get("stringValue", ""))
        except ValueError:
            geom = None
        depth = {"Polygon": 2, "MultiPolygon": 3}.get(geom.get("type") if isinstance(geom, dict) else None)
        if depth is None or not _positions_ok(geom.get("coordinates"), depth):
            out.append(f"{sid}: geometryJson positions are not number pairs")
    return out


def incident_mask(fields: dict) -> list[str]:
    """Every incident field the baseline owns: a field in the mask but not in the write is cleared."""
    return sorted(set(fields) | pack.INCIDENT_FIELDS)


def differences(want: dict[str, dict], have: dict[str, dict]) -> list[str]:
    """Baseline docs that are missing or differ, an incident field the baseline does not have, and any other plan
    (the iPhone reads the highest plan version, so a leftover plan changes what judges see)."""
    out = []
    for path in sorted(want):
        got = have.get(path)
        if got is None:
            out.append(f"{path or 'incident'}: missing")
            continue
        fields = want[path]
        if path == "":
            keys = sorted(k for k in incident_mask(fields) if fields.get(k) != got.get(k))
        else:
            keys = sorted(k for k in set(fields) | set(got) if fields.get(k) != got.get(k))
        if keys:
            out.append(f"{path or 'incident'}: differs in {keys[:8]}")
    out += [f"{p}: a plan the baseline does not have" for p in sorted(have) if p.startswith("plans/") and p not in want]
    out += [f"{p}: a segment the seed does not have (the iPhone refuses mixed prior versions)" for p in sorted(have)
            if p.startswith("segments/") and p not in want]
    return out


def reset_refused(today: datetime.date, drill: str) -> str | None:
    if drill != DRILL:
        return f"refused: the reset is for {DRILL} only"
    if JUDGING[0] <= today <= JUDGING[1]:
        return f"refused: no reset during judging ({JUDGING[0]} to {JUDGING[1]})"
    return None


def baseline_writes(want: dict[str, dict]) -> list[dict]:
    base = f"{DOCS}/incidents/{DRILL}"
    writes = []
    for path, fields in want.items():
        if path == "":
            writes.append({"update": {"name": base, "fields": fields}, "updateMask": {"fieldPaths": incident_mask(fields)},
                           "currentDocument": {"exists": True}})
        else:
            writes.append({"update": {"name": f"{base}/{path}", "fields": fields}})
    return writes


def extras(api, want: dict[str, dict]) -> list[str]:
    prefix = f"incidents/{DRILL}/"
    return [p for p in api.all_docs(f"incidents/{DRILL}") if p[len(prefix):] not in want]


TEAM_DOC = re.compile(r"teams/[^/]+")  # a team doc itself is kept: codes do not pin a team, a judge may be on it


def plan_reset(api, want: dict[str, dict]) -> tuple[list[str], list[str], list[str], list[str]]:
    """(stale plans, stale segments, other docs to delete, media) for drill-judge-1. The seed passed validation, so a
    segment or plan it lacks really is stale. Team docs are kept; what judges wrote under them (devices and their
    measurements) is not."""
    prefix = f"incidents/{DRILL}/"
    found = [(p, p[len(prefix):]) for p in extras(api, want)]
    plans = [p for p, rel in found if rel.startswith("plans/") and rel.count("/") == 1]
    segs = [p for p, rel in found if rel.startswith("segments/") and rel.count("/") == 1]
    rest = [p for p, rel in found if p not in plans and p not in segs and not TEAM_DOC.fullmatch(rel)]
    return plans, segs, rest, api.media(DRILL)


def run_reset(api, want: dict[str, dict]) -> tuple[int, int]:
    """One atomic commit rewrites the baseline and deletes any stale plan or segment (the iPhone reads the highest
    plan and refuses segments at mixed prior versions, so neither may outlive a new baseline). That commit holds at
    most 500 writes, so a grid of up to about 400 segments resets; a larger one is refused rather than split. Then
    the docs judges added are deleted, then their media; a media file already gone (a trigger removed it) counts as
    deleted. A reset that stops part way leaves the baseline in place; run it again."""
    plans, segs, rest, media = plan_reset(api, want)
    first = baseline_writes(want) + [{"delete": f"{DOCS}/{p}"} for p in plans + segs]
    if len(first) > 500:
        raise ValueError(f"the baseline with stale plans and segments needs {len(first)} writes, more than one atomic "
                         f"commit holds")
    api.commit(first)
    for i in range(0, len(rest), 400):
        api.commit([{"delete": f"{DOCS}/{p}"} for p in rest[i:i + 400]])
    for name in media:
        api.delete_media(name)
    return len(plans) + len(segs) + len(rest), len(media)


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
            return self.call(doc_url(path)).get("fields", {})
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def collection(self, path: str, show_missing: bool = False) -> dict[str, dict]:
        """Docs in a collection; with show_missing, also ids that exist only as the parent of a subcollection."""
        docs, page = {}, ""
        while True:
            q = {"pageSize": 300, **({"showMissing": "true"} if show_missing else {}), **({"pageToken": page} if page else {})}
            r = self.call(f"{doc_url(path)}?{urllib.parse.urlencode(q)}")
            for d in r.get("documents", []):
                docs[d["name"].rsplit("/", 1)[1]] = d.get("fields", {})  # a resource name holds the id as it is
            page = r.get("nextPageToken", "")
            if not page:
                return docs

    def subcollections(self, path: str) -> list[str]:
        ids, page = [], ""
        while True:
            r = self.call(f"{doc_url(path)}:listCollectionIds", {"pageSize": 100, **({"pageToken": page} if page else {})}, "POST")
            ids += r.get("collectionIds", [])
            page = r.get("nextPageToken", "")
            if not page:
                return ids

    def all_docs(self, path: str, depth: int = 0) -> list[str]:
        """Every doc path under a doc, through nested collections, including parents that were never written (an
        iPhone measurement can sit under a device doc that does not exist)."""
        if depth > 4:
            raise ValueError(f"nesting deeper than 4 under {path}")
        out = []
        for c in self.subcollections(path):
            for d in self.collection(f"{path}/{c}", show_missing=True):
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

    def commit(self, writes: list[dict]) -> None:
        self.call(f"https://firestore.googleapis.com/v1/{DOCS}:commit", {"writes": writes}, "POST")

    def delete_media(self, name: str) -> bool:
        try:
            self.call(f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{urllib.parse.quote(name, safe='')}", method="DELETE")
            return True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            raise


def read_seed(api: Api, seed_id: str) -> dict:
    base = f"incidents/{seed_id}"
    return {"incident": api.doc(base) or {}, "segments": api.collection(f"{base}/segments"), "plans": api.collection(f"{base}/plans"),
            "teams": api.collection(f"{base}/teams"), "shared": api.doc(f"{base}/profile/shared")}


def read_drill(api: Api) -> dict[str, dict]:
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


def main(argv: list[str]) -> int:
    seed_id = json.loads(pack.SEED_FILE.read_text())["incidentId"]
    ts = pack.JUDGE_TS.read_text()
    if argv not in (["--check"], ["--write"], ["--reset"], ["--reset", "--yes"]):
        print(__doc__.strip())
        return 2
    try:
        api = Api()
        want = baseline(read_seed(api, seed_id), ts)
        if argv == ["--check"]:
            found = differences(want, read_drill(api))
            added = extras(api, want)
            for p in found:
                print(f"judge_drill: {p}")
            print(f"judge_drill: {len(added)} docs added since the baseline (judges' events, answers and devices, and server "
                  f"records such as push counters)")
            print("judge_drill: " + (f"FAIL, {len(found)} difference(s) from the seed" if found else
                                     f"ok, {DRILL}'s {len(want)} baseline docs match the seed {seed_id}"))
            return 1 if found else 0
        if argv == ["--write"]:
            if api.doc(f"incidents/{DRILL}") is None:
                print(f"judge_drill: {DRILL} does not exist; create it first with tools/seed/seed_drill.py")
                return 1
            writes = baseline_writes(want)
            for i in range(0, len(writes), 400):
                api.commit(writes[i:i + 400])
            print(f"judge_drill: wrote {len(want)} baseline docs to {DRILL} from the seed {seed_id}")
            return 0
        refused = reset_refused(datetime.datetime.now(datetime.timezone.utc).date(), DRILL)
        if refused:
            print(f"judge_drill: {refused}")
            return 1
        if argv == ["--reset"]:
            plans, segs, rest, media = plan_reset(api, want)
            print(f"judge_drill: a reset would rewrite the {len(want)} baseline docs, delete {len(plans)} stale plans and "
                  f"{len(segs)} stale segments with them, then {len(rest)} other docs and {len(media)} media files; "
                  f"dry run, add --yes to reset")
            return 0
        n_docs, n_media = run_reset(api, want)
        found = differences(want, read_drill(api))
        print(f"judge_drill: reset done; rewrote the baseline, deleted {n_docs} docs and {n_media} media files; "
              + ("baseline matches" if not found else f"FAIL, {len(found)} difference(s) remain"))
        return 1 if found else 0
    except ValueError as e:
        print(f"judge_drill: refused, the seed is incomplete or unreadable: {e}")
        return 2
    except (OSError, urllib.error.URLError) as e:
        print(f"judge_drill: cannot read or write: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
