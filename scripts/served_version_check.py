#!/usr/bin/env python3
"""The live site must be built from main's production inputs.

Hosting is deployed by hand, so after a merge the site can lag main. This reads the site's /version.json (written
by the build: the commit and whether the tree was dirty) and compares that commit's production inputs (the web app,
the shared engine and data it imports, hosting config and the package files, without tests, e2e specs, harness
pages or markdown) with origin/main's. Content is compared, not ancestry, so a squash merge with the same code
passes, a build from a branch ahead of main with other code fails, and a main commit that only touches tests does
not ask for a deploy. A failure names both commits and the files that differ: deploy hosting from main.
Retires itself after 2026-12-17 (judging ends Dec 16).

Run from a full clone (the probe checks out with fetch-depth 0). Usage: python3 -I scripts/served_version_check.py
"""

import json
import os
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

RETIRE_AFTER = date(2026, 12, 17)
SITE = "https://buildhybridai-2026-yg3m.web.app"
MAIN = "origin/main"
# What the hosted build reads, as git pathspecs: web/vite.config.ts builds web/index.html from web/src, reads
# shared/ (engine, constants, schemas, grids) and the root package files; firebase.json is the hosting config. Test
# files, browser specs, harness pages, markdown and the shared test vectors (no production code imports them; the
# rules only name them in comments) are never built.
INPUTS = [
    "web", "shared", "firebase.json", "package.json", "package-lock.json",
    ":(exclude)web/e2e", ":(exclude)web/harness", ":(exclude)web/extras-harness", ":(exclude)web/vitest.config.ts",
    ":(exclude)shared/test-vectors",
    ":(exclude,glob)**/*.test.ts", ":(exclude,glob)**/*.test.tsx", ":(exclude,glob)**/test/**", ":(exclude,glob)**/*.md",
]


def _git(repo: Path, *args: str) -> tuple[int, str]:
    r = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


def check(version: dict, repo: Path, main_ref: str = MAIN) -> list[str]:
    """Problems with what the site serves, given its version.json; empty when it was built from main's inputs."""
    served = version.get("commit")
    if not isinstance(served, str) or not served:
        return ["version.json has no commit"]
    problems = []
    if version.get("dirty") is not False:
        problems.append(f"the served build {served[:8]} was built from a dirty tree")
    code, shallow = _git(repo, "rev-parse", "--is-shallow-repository")
    if code != 0 or shallow != "false":
        return problems + ["this clone is shallow (or not a repository), so the served commit cannot be compared"]
    code, main = _git(repo, "rev-parse", "--verify", "--quiet", f"{main_ref}^{{commit}}")
    if code != 0 or not main:
        return problems + [f"{main_ref} cannot be resolved here, so there is nothing to compare the site with"]
    code, _ = _git(repo, "cat-file", "-e", f"{served}^{{commit}}")
    if code != 0:
        return problems + [f"the served commit {served[:8]} is not in this repository, so what it was built from cannot be checked"]
    code, out = _git(repo, "diff", "--name-only", served, main, "--", *INPUTS)
    if code != 0:
        return problems + [f"git could not compare {served[:8]} with {main[:8]}"]
    files = out.splitlines()
    if files:
        shown = ", ".join(files[:5]) + (f" and {len(files) - 5} more" if len(files) > 5 else "")
        problems.append(f"the site serves {served[:8]} but {main_ref} is {main[:8]}, and {len(files)} production "
                        f"file(s) differ ({shown}): deploy hosting from main")
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
    repo = Path(__file__).resolve().parents[1]
    problems = check(version, repo)
    for p in problems:
        print(f"served_version_check: {p}")
    if not problems:
        _, main_sha = _git(repo, "rev-parse", MAIN)
        print(f"served_version_check: ok, {site} serves {version['commit'][:8]}, built from the same production "
              f"inputs as {MAIN} ({main_sha[:8]})")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
