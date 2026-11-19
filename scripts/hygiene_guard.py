#!/usr/bin/env python3
"""Public-hygiene guard: the repository's text names no internal build process (orchestrator, coordinator), no
private rule id (HR followed by digits), no private playbook or notes (Galaxy, Sookra, vault) and no private path
(research/build, ~/.claude, pls-spikes). Write "Source: review" or the public reason instead.

It walks every tracked file plus untracked files that .gitignore does not exclude (so a file about to be added
is checked too), skips this guard and its test by pathspec, and fails if it walks fewer files than the floor
(a walk that reads nothing must not read as clean). File contents only; git history is not rewritten.

Private repository (default): prints every hit and exits 0. Public repository (--public, set in CI from
github.event.repository.private): exits 1 on any hit.

Usage: python3 -I scripts/hygiene_guard.py [root] [--public] [--floor N]
"""
import os
import re
import subprocess
import sys
from pathlib import Path

FLOOR = 300  # 620 files were walked on 2026-11-18
SELF = ("scripts/hygiene_guard.py", "scripts/test_hygiene_guard.py")
PATTERN = re.compile(
    r"\b(?:orchestrator|coordinator|galaxy|vault)\b"
    r"|\bHR[0-9]{2,3}\b"
    r"|(?<!stephen )\bsookra\b"
    r"|research/build|\.claude/|pls-spikes",
    re.IGNORECASE,
)


# Folders a walk on disk skips: dependencies, build output and caches (git would ignore them).
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", ".build", ".gradle", "DerivedData", "__pycache__",
             ".pytest_cache", ".mypy_cache", ".ruff_cache", ".firebase", ".swiftpm", "coverage", ".turbo"}


def in_git_checkout(root: Path) -> bool:
    try:
        r = subprocess.run(["git", "-C", str(root), "rev-parse", "--is-inside-work-tree"], capture_output=True)
    except FileNotFoundError:
        return False
    return r.returncode == 0 and r.stdout.strip() == b"true"


def disk_files(root: Path, skip: tuple[str, ...]) -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            rel = os.path.relpath(os.path.join(dirpath, f), root).replace(os.sep, "/")
            if rel not in skip:
                out.append(rel)
    return sorted(out)


def files(root: Path) -> list[str]:
    if not in_git_checkout(root):
        print("hygiene_guard: not a git checkout (no .git, for example a ZIP download); walking the files on disk instead")
        return disk_files(root, SELF)
    cmd = ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."]
    cmd += [f":(exclude){p}" for p in SELF]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout.decode()
    return sorted({f for f in out.split("\0") if f})


def scan(root: Path) -> tuple[int, list[str]]:
    walked, hits = 0, []
    for name in files(root):
        path = root / name
        if not path.is_file():
            continue
        try:
            text = path.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        walked += 1
        for n, line in enumerate(text.splitlines(), start=1):
            for m in PATTERN.finditer(line):
                hits.append(f"{name}:{n}: {m.group(0)}")
    return walked, hits


def main(argv: list[str]) -> int:
    public = "--public" in argv
    floor = int(argv[argv.index("--floor") + 1]) if "--floor" in argv else FLOOR
    args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--floor")]
    root = Path(args[0] if args else ".").resolve()
    walked, hits = scan(root)
    if walked < floor:
        print(f"hygiene_guard: walked {walked} files, expected at least {floor}; the file list is wrong")
        return 1
    for h in hits:
        print(f"hygiene_guard: {h}")
    if not hits:
        print(f"hygiene_guard: ok, {walked} files walked, no internal names or private paths")
        return 0
    if public:
        print(f"hygiene_guard: FAIL, {len(hits)} hits in a public repository")
        return 1
    print(f"hygiene_guard: {len(hits)} hits; they fail CI once the repository is public")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
