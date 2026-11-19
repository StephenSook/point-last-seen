"""Tests for scripts/hygiene_guard.py: repository text names no internal process words, private rule ids or private
paths. The guard keeps its list as hashes, and these tests build each planted term from parts, so neither file spells
one."""
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name("hygiene_guard.py")
J = "".join
# The planted terms, one per guarded entry, each built from parts.
WORDS = [J(["orch", "estrator"]), J(["coord", "inator"]), J(["gal", "axy"]), J(["va", "ult"]), J(["ri", "val"]),
         J(["obsi", "dian"]), J(["soo", "kra"])]
PHRASES = [J(["self", "-au", "dit"]), J(["gra", "ding", " kit"]), J(["co", "dex cl", "oud sl", "ice"]), J(["ste", "phen-pro", "mpt"]),
           J(["rese", "arch/bu", "ild"]), J(["rese", "arch/pri", "vate"]), J(["pls-sp", "ikes"])]
ORCH, COORD, GAL, VAULT, RIVAL, OBS, SURNAME = WORDS


def repo(tmp_path: Path, files: dict[str, str], ignored: dict[str, str] | None = None) -> Path:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / "scripts").mkdir()
    shutil.copy(SCRIPT, tmp_path / "scripts" / "hygiene_guard.py")
    for name, text in {**files, **(ignored or {})}.items():
        p = tmp_path / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    if ignored:
        (tmp_path / ".gitignore").write_text("\n".join(ignored) + "\n")
    subprocess.run(["git", "-C", str(tmp_path), "add", "-A"], check=True)
    return tmp_path


def run(root: Path, *args: str):
    return subprocess.run([sys.executable, "-I", str(root / "scripts" / "hygiene_guard.py"), str(root), "--floor", "1", *args],
                          capture_output=True, text=True)


def fails(tmp_path: Path, name: str, text: str) -> bool:
    root = tmp_path / name
    root.mkdir()
    return run(repo(root, {"c.md": text + "\n"}), "--public").returncode == 1


def test_a_hit_fails_only_once_the_repo_is_public(tmp_path):
    root = repo(tmp_path, {"docs/a.md": f"line one\nSource: {ORCH} ruling\n"})
    private, public = run(root), run(root, "--public")
    assert private.returncode == 0 and "docs/a.md:2" in private.stdout
    assert public.returncode == 1 and "docs/a.md:2" in public.stdout


def test_the_guard_names_none_of_its_words_and_holds_each_ones_hash():
    # Review: the repository is public, so the list it protects must not be readable in it.
    text = SCRIPT.read_text().lower()
    for term in WORDS + PHRASES:
        assert term not in text, "the guard spells one of its terms"
        assert hashlib.sha256(term.encode()).hexdigest() in text
    assert re.search(r"[0-9a-f]{64}", text)


def test_each_word_is_whole_and_case_insensitive(tmp_path):
    clean = {"a.swift": f"struct Read{ORCH.capitalize()} {{}}\n", "NOTICE": f"Copyright 2026 Stephen {SURNAME.capitalize()}\n",
             "b.md": "project buildhybridai-2026-yg3m, HR1 and HRX\n"}
    assert run(repo(tmp_path, clean), "--public").returncode == 0
    for i, text in enumerate([f"The {COORD.capitalize()} said", "rule HR217", f"the {GAL.capitalize()} playbook",
                              f"{SURNAME.capitalize()} Methodology", f"the {VAULT} note", f"see {PHRASES[4]}/PLAN.md",
                              "~/.claude/memory", f"~/dev/{PHRASES[6]}/x", f"two {RIVAL}s", f"{VAULT.upper()}S"]):
        assert fails(tmp_path, f"w{i}", text), text


def test_every_phrase_is_found_however_it_is_cased_and_a_phrase_needs_its_own_joiner(tmp_path):
    for i, phrase in enumerate(PHRASES):
        assert fails(tmp_path, f"p{i}", f"see the {phrase.upper()} here"), phrase
    # The words of a phrase are not guarded alone, and another joiner is another phrase.
    assert not fails(tmp_path, "parts", "a self check, a grading rubric, a codex run, a cloud slice")


def test_untracked_files_are_scanned_and_ignored_ones_are_not(tmp_path):
    root = repo(tmp_path, {"a.md": "clean\n"}, ignored={"local.md": f"{ORCH}\n"})
    assert run(root, "--public").returncode == 0
    (root / "new.md").write_text(f"{COORD}\n")
    assert run(root, "--public").returncode == 1


def test_the_guard_does_not_scan_itself_or_its_test(tmp_path):
    root = repo(tmp_path, {"a.md": "clean\n", "scripts/test_hygiene_guard.py": f"{ORCH}\n"})
    assert run(root, "--public").returncode == 0


def test_a_walk_below_the_file_floor_fails_in_both_modes(tmp_path):
    root = repo(tmp_path, {"a.md": "clean\n"})
    for args in ([], ["--public"]):
        out = subprocess.run([sys.executable, "-I", str(root / "scripts" / "hygiene_guard.py"), str(root), "--floor", "50", *args],
                             capture_output=True, text=True)
        assert out.returncode == 1 and "expected at least 50" in out.stdout


def test_without_git_it_walks_the_files_on_disk_and_still_fails_a_hit(tmp_path):
    # A ZIP download has no .git: the guard says so and reads the files on disk, skipping dependency folders.
    (tmp_path / "scripts").mkdir()
    shutil.copy(SCRIPT, tmp_path / "scripts" / "hygiene_guard.py")
    (tmp_path / "a.md").write_text("clean\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "x.md").write_text(f"{ORCH}\n")
    clean = run(tmp_path, "--public")
    assert clean.returncode == 0, clean.stdout
    assert "not a git checkout" in clean.stdout
    (tmp_path / "b.md").write_text(f"Source: {COORD}\n")
    assert run(tmp_path, "--public").returncode == 1


def test_build_process_and_private_names_fail_in_public_and_branch_names_pass(tmp_path):
    # Planted positive controls for the work-stream form and the words; git branch names stay allowed.
    clean = {"a.md": "git checkout lane-web && git merge lane-android\nmerge lane-ios into main\n",
             "b.md": "a laneway, the second lane of traffic, lanes on a road\n"}
    assert run(repo(tmp_path, clean), "--public").returncode == 0
    for i, text in enumerate([f"the {RIVAL} projects", f"a {RIVAL.capitalize()} entry", "lane A ruling 4", "lane C's fix",
                              "Lane D found it", "per lane-b rule", "import from ./laneC", f"notes in {OBS.capitalize()}"]):
        assert fails(tmp_path, f"case{i}", text), text
