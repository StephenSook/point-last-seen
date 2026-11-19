#!/usr/bin/env python3
"""Public-hygiene guard: the repository's text names no internal process words and no private paths. Write
"Source: review" or the public reason instead. The list is stored as SHA-256 hashes, so this file names none of it.

The text is split into words (runs of letters and digits, lowercased). A word is a hit when its hash is listed, or,
for a word of more than 3 letters ending in "s", when the hash of the word without that "s" is. Two or three words
joined by "-", a space or "/" are a hit when the hash of the phrase, joined exactly so, is listed. The author's
surname is allowed right after the given name, as in the copyright line. A few private forms are matched by shape:
a review rule id (HR and two or three digits), a work stream named as a role ("lane" and a letter a to d; branch
names such as lane-web do not match) and a path into a home folder's assistant settings.

It walks every tracked file plus untracked files that .gitignore does not exclude (so a file about to be added
is checked too), skips this guard and its test by pathspec, and fails if it walks fewer files than the floor
(a walk that reads nothing must not read as clean). File contents only; git history is not rewritten.

Private repository (default): prints every hit and exits 0. Public repository (--public, set in CI from
github.event.repository.private): exits 1 on any hit.

Usage: python3 -I scripts/hygiene_guard.py [root] [--public] [--floor N]
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

FLOOR = 300  # 620 files were walked on 2026-11-18
SELF = ("scripts/hygiene_guard.py", "scripts/test_hygiene_guard.py")

# One word each, lowercased.
WORDS = frozenset({
    "11376b7e2acf0c93001f16d10c7ef82ecc88f2292851ba9a5fb14767c7d027ec",
    "bf24385098410391a81d92b2de72d3a2946d24f42ee387e51004a868281a2408",
    "eba4ae33f54ae0f96bed25bfc13abd887ae157380330cd3fd3f0a4d054ce3a3f",
    "e6f0a1fbb43c89196dcfcbef85908f19ab4c5f7cc4f4c452284697757683d7ef",
    "1db147fa22abae8a70c94152c9ec8cb82bdd0cc8135730a11879ae9dd7ad0375",
    "4e2295dd929e424aa1afde7049924cb231f451c9884d7915ae33690b73b227ec",
    "45094d013c01182ea62b68590335599f0d663e554122b0c2f5acee49b69cc083",
})
# Two or three words, lowercased, joined exactly as written.
PHRASES = frozenset({
    "93959d627f900c159eb24d1621ea5a7f540b55b8088de32a3034cebb0c6b7dcc",
    "dbbf1f13afc72262623e57579bc404f54e2e4a7f3bfd199e9ca321ced7f1ba8f",
    "6902f3ae8981297310142b4c22ecd8d4303c5ab868a3c19228414b5481b86740",
    "d148ce894d5bd13ffc6bd2c4b7731613a3f8f6b84fc63f8a6e5718c97f1c3cb8",
    "8d5c1c1d3890d7e74e4529250848bd6836eea6ee96bb592ac8cf9ad67ec95174",
    "e58c6fe1372f09e2f9fd4c8617425e829a6b26e1e7a63fe43a0fd0070c52dd25",
    "2464946b9d5fc5b4af5c88ac5298f978dc66a9315eb0a04c4dbc88eb7ab8337b",
})
JOINERS = ("-", " ", "/")
AUTHOR_GIVEN = "stephen"
SHAPES = (
    ("a review rule id", re.compile(r"\bHR[0-9]{2,3}\b", re.IGNORECASE)),
    ("a work stream named as a role", re.compile(r"\blane[ -]?[a-d]\b", re.IGNORECASE)),
    ("a private settings path", re.compile(r"\.claude/")),
)
TOKEN = re.compile(r"[A-Za-z0-9]+")


def _hash(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _word_hit(w: str) -> bool:
    return _hash(w) in WORDS or (len(w) > 3 and w.endswith("s") and _hash(w[:-1]) in WORDS)


def line_hits(line: str) -> list[str]:
    """What is private on one line: each listed word or phrase (by its hash) and each private shape."""
    hits = []
    toks = [(m.group(0).lower(), m.start(), m.end()) for m in TOKEN.finditer(line)]
    for i, (w, start, _) in enumerate(toks):
        after_author = i > 0 and toks[i - 1][0] == AUTHOR_GIVEN and re.fullmatch(r"[ \t]+", line[toks[i - 1][2]:start]) is not None
        if _word_hit(w) and not after_author:
            hits.append("a private word")
        phrase = w
        for j in range(i - 1, max(i - 3, -1), -1):
            between = line[toks[j][2]:toks[j + 1][1]]
            if between not in JOINERS:
                break
            phrase = toks[j][0] + between + phrase
            if _hash(phrase) in PHRASES:
                hits.append("a private phrase or path")
    for kind, pattern in SHAPES:
        hits.extend(kind for _ in pattern.finditer(line))
    return hits


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
            for kind in line_hits(line):
                hits.append(f"{name}:{n}: {kind}")
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
