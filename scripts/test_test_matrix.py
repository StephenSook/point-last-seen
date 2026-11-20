"""docs/TEST-MATRIX.md cites only tracked evidence and code lines that still hold the call each row names."""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATRIX = ROOT / "docs/TEST-MATRIX.md"
COLUMNS = 9
CODE_REF = re.compile(r"`([^`]+)` \(`([^`:\s]+):(\d+)`\)")
EVIDENCE = re.compile(r"`((?:docs|web|shared|scripts|tools)/[^`\s:]+)`")  # a file:line is a code ref, checked above
NO_FOLDER = re.compile(r"no `([^`]+)` folder")


def tracked() -> set[str]:
    out = subprocess.run(["git", "ls-files", "--cached"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return set(out.split())


def rows(text: str) -> list[list[str]]:
    lines = [l for l in text.splitlines() if l.startswith("| ") and not l.startswith("| Platform") and not l.startswith("|---")]
    return [[c.strip() for c in l.strip().strip("|").split("|")] for l in lines]


def problems(table: list[list[str]], files: set[str], read=lambda p: (ROOT / p).read_text()) -> list[str]:
    out = []
    for r in table:
        name = " / ".join(r[:2])
        if len(r) != COLUMNS:
            out.append(f"{name}: {len(r)} columns, not {COLUMNS}")
            continue
        refs = CODE_REF.findall(r[2])
        if not refs:
            out.append(f"{name}: the mode cell names no `call` (`file:line`)")
        for token, path, line in refs:
            if path not in files:
                out.append(f"{name}: {path} is not tracked")
                continue
            lines = read(path).splitlines()
            if int(line) > len(lines) or token not in lines[int(line) - 1]:
                out.append(f"{name}: {path}:{line} does not hold {token}")
        evidence = r[8]
        if evidence.startswith("Not run"):
            if not evidence.startswith("Not run: ") or len(evidence) < 20 or r[7] != "Not run":
                out.append(f"{name}: a path that did not run gives its reason and says Not run in Result")
        elif not EVIDENCE.search(evidence):
            out.append(f"{name}: no tracked evidence file named")
        for path in EVIDENCE.findall(NO_FOLDER.sub("", " ".join(r))):
            if path not in files:
                out.append(f"{name}: {path} is not tracked")
        for folder in NO_FOLDER.findall(evidence):
            if any(f.startswith(folder.rstrip("/") + "/") for f in files):
                out.append(f"{name}: says there is no {folder} folder, but the repository has one; record the run")
    return out


def test_every_row_cites_tracked_evidence_and_live_code_lines():
    table = rows(MATRIX.read_text())
    assert len(table) >= 10
    assert problems(table, tracked()) == []


def test_every_platform_and_both_paths_have_a_row():
    table = rows(MATRIX.read_text())
    have = {(r[0], "Cloud" if r[1].startswith("Cloud") else "On-device") for r in table}
    for platform in ("Web", "Android", "iPhone"):
        assert (platform, "Cloud") in have and (platform, "On-device") in have, platform


def test_the_check_fails_an_untracked_file_a_moved_call_and_a_reasonless_skip():
    row = lambda mode, result, ev: ["Web", "Cloud: x", mode, "m", "h", "c", "d", result, ev]
    files = {"web/a.ts", "docs/evidence/x.md"}
    read = lambda p: "line one\n  mode: InferenceMode.ONLY_IN_CLOUD,\n"
    good = row("`InferenceMode.ONLY_IN_CLOUD` (`web/a.ts:2`)", "ok", "`docs/evidence/x.md`")
    assert problems([good], files, read) == []
    assert problems([row("`InferenceMode.ONLY_IN_CLOUD` (`web/a.ts:2`)", "ok", "`docs/evidence/new.md`")], files, read)
    assert problems([row("`InferenceMode.ONLY_IN_CLOUD` (`web/a.ts:1`)", "ok", "`docs/evidence/x.md`")], files, read)
    assert problems([row("`InferenceMode.ONLY_IN_CLOUD` (`web/a.ts:2`)", "Not run", "Not run")], files, read)
    ios = row("`InferenceMode.ONLY_IN_CLOUD` (`web/a.ts:2`)", "Not run", "Not run: no tracked iPhone run (no `docs/evidence/ios` folder)")
    assert problems([ios], files, read) == []
    assert problems([ios], files | {"docs/evidence/ios/run.md"}, read), "a new evidence folder must replace Not run"
