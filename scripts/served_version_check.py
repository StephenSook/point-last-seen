#!/usr/bin/env python3
"""The live site must serve main's newest web change.

Hosting is deployed by hand, so after a merge the site can lag main. This reads the site's /version.json (written
by the build: the commit and whether the tree was dirty) and checks that main's newest commit touching anything the
hosted site is built from is the served commit or one of its ancestors. A failure names both commits and how many
web changes the site is missing: deploy hosting from main. Retires itself after 2026-12-17 (judging ends Dec 16).

Run from a full clone of main (the probe checks out with fetch-depth 0). Usage: python3 -I scripts/served_version_check.py
"""

import json
import os
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timezone

RETIRE_AFTER = date(2026, 12, 17)
SITE = "https://buildhybridai-2026-yg3m.web.app"
# Everything the hosted site is built from: the web app, the shared engine and constants it imports, hosting config
# and the dependency lockfile.
WEB_PATHS = ["web", "shared", "firebase.json", "package.json", "package-lock.json"]


def git(args: list[str]) -> tuple[int, str]:
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.returncode, r.stdout


def check(version: dict, run=git) -> list[str]:
    """Problems with what the site serves, given its version.json; empty when it serves main's newest web change."""
    served = version.get("commit")
    if not isinstance(served, str) or not served:
        return ["version.json has no commit"]
    problems = []
    if version.get("dirty") is not False:
        problems.append(f"the served build {served[:8]} was built from a dirty tree")
    code, out = run(["log", "-1", "--format=%H", "HEAD", "--", *WEB_PATHS])
    newest = out.strip()
    if code != 0 or not newest:
        return problems + ["could not read main's newest web commit"]
    code, _ = run(["merge-base", "--is-ancestor", newest, served])
    if code != 0:
        _, n = run(["rev-list", "--count", f"{served}..{newest}", "--", *WEB_PATHS])
        problems.append(f"the site serves {served[:8]} but main's newest web commit is {newest[:8]} "
                        f"({n.strip() or '?'} web commit(s) not deployed): deploy hosting from main")
    return problems


def main() -> int:
    if datetime.now(timezone.utc).date() > RETIRE_AFTER:
        print(f"served_version_check: retired after {RETIRE_AFTER} (judging over); nothing checked")
        return 0
    site = os.environ.get("PLS_SITE") or SITE
    try:
        with urllib.request.urlopen(f"{site}/version.json", timeout=20) as r:
            version = json.loads(r.read())
    except Exception as e:  # a failed read is a failure, never a pass
        print(f"served_version_check: could not read {site}/version.json: {e}")
        return 1
    problems = check(version)
    for p in problems:
        print(f"served_version_check: {p}")
    if not problems:
        print(f"served_version_check: ok, {site} serves {version['commit'][:8]}, which holds main's newest web change")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
