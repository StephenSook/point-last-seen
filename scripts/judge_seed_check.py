#!/usr/bin/env python3
"""Judge seed drift check.

Every judge practice search is copied from one drill (JUDGE_SEED_INCIDENT in functions/src/judgeSession.ts): its
settings (every incident field the copy does not skip, NOT_COPIED there), its segments, its teams and its shared
profile. This reads that drill from the live project and compares it with the committed baseline,
scripts/judge_seed_baseline.json. It also counts the drill's events, which a copy never takes, so a test that
writes into the seed shows up.

Exit 0 when everything matches, 1 on any drift (each difference is named), 2 when anything cannot be read: a failed
read is never a pass. Run it before every hosting deploy. After a deliberate change to the seed, refresh the
baseline with --write, review the diff and commit it.

Uses the Firestore REST API with the gcloud user's OAuth token (IAM, so security rules do not apply). Read only.

Usage: python3 -I scripts/judge_seed_check.py <project> [--write] [--baseline path]
"""
import hashlib
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
JUDGE_SESSION = ROOT / "functions/src/judgeSession.ts"
BASELINE = ROOT / "scripts/judge_seed_baseline.json"


class ReadError(Exception):
    """A document or collection that could not be read."""


def seed_constants(ts: str) -> tuple[str, set[str]]:
    """The seed incident id and the incident fields a copy skips, read from the function's own source."""
    seed = re.search(r'JUDGE_SEED_INCIDENT\s*=\s*"([A-Za-z0-9_-]+)"', ts)
    skipped = re.search(r"NOT_COPIED\s*=\s*new Set\(\[([^\]]*)\]\)", ts, re.S)
    if not seed or not skipped:
        raise ValueError("JUDGE_SEED_INCIDENT or NOT_COPIED not found in functions/src/judgeSession.ts")
    return seed.group(1), set(re.findall(r'"([^"]+)"', skipped.group(1)))


def plain(v: dict):
    """A Firestore REST value as plain JSON."""
    kind, x = next(iter(v.items()))
    if kind == "integerValue":
        return int(x)
    if kind == "mapValue":
        return {k: plain(f) for k, f in (x.get("fields") or {}).items()}
    if kind == "arrayValue":
        return [plain(i) for i in (x.get("values") or [])]
    if kind == "nullValue":
        return None
    return x


def _fields(d: dict) -> dict:
    return {k: plain(v) for k, v in (d.get("fields") or {}).items()}


def _id(d: dict) -> str:
    return d["name"].rsplit("/", 1)[1]


def _sha(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def snapshot(fetch: Callable[[str], object], seed: str, skipped: set[str]) -> dict:
    """What a practice search copies from the seed, and a count and hash of the seed's events."""
    base = f"incidents/{seed}"
    incident = {k: v for k, v in _fields(fetch(base)).items() if k not in skipped}
    segments = {_id(d): _fields(d) for d in fetch(f"{base}/segments")}
    events = sorted(_id(d) for d in fetch(f"{base}/events"))
    return {
        "seed": seed,
        "incident": incident,
        "profileShared": _fields(fetch(f"{base}/profile/shared")),
        "teams": {_id(d): _fields(d) for d in fetch(f"{base}/teams")},
        "segments": {"count": len(segments), "sha256": _sha(segments)},
        "events": {"count": len(events), "sha256": _sha(events)},
    }


def diff(base: dict, now: dict) -> list[str]:
    """Each difference between the baseline and the live seed, named."""
    out = []
    if base.get("seed") != now.get("seed"):
        out.append(f"seed: {base.get('seed')} -> {now.get('seed')}")
    for section, label in (("incident", "incident"), ("profileShared", "profile/shared")):
        a, b = base.get(section, {}), now.get(section, {})
        for k in sorted(set(a) | set(b)):
            if a.get(k, "<absent>") != b.get(k, "<absent>"):
                out.append(f"{label}.{k}: {json.dumps(a.get(k, '<absent>'))[:80]} -> {json.dumps(b.get(k, '<absent>'))[:80]}")
    a, b = base.get("teams", {}), now.get("teams", {})
    for t in sorted(set(a) | set(b)):
        if a.get(t) != b.get(t):
            out.append(f"teams/{t}: changed" if t in a and t in b else f"teams/{t}: {'removed' if t in a else 'added'}")
    for section in ("segments", "events"):
        a, b = base.get(section, {}), now.get(section, {})
        if a != b:
            out.append(f"{section}: {a.get('count')} -> {b.get('count')}" + ("" if a.get("count") != b.get("count") else " (contents changed)"))
    return out


def run(fetch: Callable[[str], object], ts: str, baseline: Path, write: bool) -> int:
    try:
        seed, skipped = seed_constants(ts)
        now = snapshot(fetch, seed, skipped)
    except (ReadError, ValueError) as e:
        print(f"judge_seed_check: cannot read the judge seed: {e}")
        return 2
    if write:
        baseline.write_text(json.dumps(now, indent=2, sort_keys=True) + "\n")
        print(f"judge_seed_check: wrote {baseline.name} for {seed} ({now['segments']['count']} segments, {now['events']['count']} events)")
        return 0
    try:
        base = json.loads(baseline.read_text())
    except (OSError, ValueError) as e:
        print(f"judge_seed_check: cannot read the baseline {baseline}: {e}")
        return 2
    lines = diff(base, now)
    for line in lines:
        print(f"judge_seed_check: DRIFT {line}")
    if lines:
        print(f"judge_seed_check: FAIL, the judge seed {seed} differs from {baseline.name} in {len(lines)} place(s)")
        return 1
    print(f"judge_seed_check: ok, {seed} matches {baseline.name}")
    return 0


def rest_fetcher(project: str) -> Callable[[str], object]:
    tok = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
    token = tok.stdout.strip()
    if tok.returncode != 0 or not token:
        raise ReadError("no gcloud access token (run gcloud auth login)")
    base = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents"
    headers = {"Authorization": f"Bearer {token}", "x-goog-user-project": project}

    def get(url: str) -> dict:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, ValueError) as e:
            raise ReadError(f"{url.split('/documents/')[-1]}: {e}") from e

    def fetch(path: str):
        if path.count("/") % 2 == 1:  # a document
            return get(f"{base}/{path}")
        docs, page = [], ""
        while True:
            r = get(f"{base}/{path}?pageSize=300" + (f"&pageToken={page}" if page else ""))
            docs += r.get("documents", [])
            page = r.get("nextPageToken", "")
            if not page:
                return docs
    return fetch


def main(argv: list[str]) -> int:
    args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--baseline")]
    if len(args) != 1:
        print(__doc__.strip().splitlines()[-1])
        return 2
    baseline = Path(argv[argv.index("--baseline") + 1]) if "--baseline" in argv else BASELINE
    try:
        fetch = rest_fetcher(args[0])
    except ReadError as e:
        print(f"judge_seed_check: cannot read the judge seed: {e}")
        return 2
    return run(fetch, JUDGE_SESSION.read_text(), baseline, "--write" in argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
