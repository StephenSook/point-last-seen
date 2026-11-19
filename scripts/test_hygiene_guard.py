"""Tests for scripts/hygiene_guard.py: repository text names no internal process, private rule id or private path."""
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name("hygiene_guard.py")


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


def test_a_hit_fails_only_once_the_repo_is_public(tmp_path):
    root = repo(tmp_path, {"docs/a.md": "line one\nSource: orchestrator ruling\n"})
    private, public = run(root), run(root, "--public")
    assert private.returncode == 0 and "docs/a.md:2" in private.stdout
    assert public.returncode == 1 and "docs/a.md:2" in public.stdout


def test_each_pattern_is_whole_word_and_case_insensitive(tmp_path):
    clean = {"a.swift": "struct ReadOrchestrator {}\n", "NOTICE": "Copyright 2026 Stephen Sookra\n",
             "b.md": "project buildhybridai-2026-yg3m, HR1 and HRX\n"}
    assert run(repo(tmp_path, clean), "--public").returncode == 0
    for text in ["The Coordinator said", "rule HR217", "the Galaxy playbook", "Sookra Methodology", "the vault note",
                 "see research/build/PLAN.md", "~/.claude/memory", "~/dev/pls-spikes/x"]:
        root = tmp_path / text.replace("/", "_").replace(" ", "_").replace("~", "h").replace(".", "d")
        root.mkdir()
        assert run(repo(root, {"c.md": text + "\n"}), "--public").returncode == 1, text


def test_untracked_files_are_scanned_and_ignored_ones_are_not(tmp_path):
    root = repo(tmp_path, {"a.md": "clean\n"}, ignored={"local.md": "orchestrator\n"})
    assert run(root, "--public").returncode == 0
    (root / "new.md").write_text("coordinator\n")
    assert run(root, "--public").returncode == 1


def test_the_guard_does_not_scan_itself(tmp_path):
    root = repo(tmp_path, {"a.md": "clean\n"})
    assert "orchestrator" in (root / "scripts" / "hygiene_guard.py").read_text().lower()
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
    (tmp_path / "node_modules" / "x.md").write_text("orchestrator\n")
    clean = run(tmp_path, "--public")
    assert clean.returncode == 0, clean.stdout
    assert "not a git checkout" in clean.stdout
    (tmp_path / "b.md").write_text("Source: coordinator\n")
    assert run(tmp_path, "--public").returncode == 1


def test_build_process_and_private_names_fail_in_public_and_branch_names_pass(tmp_path):
    # Planted positive controls, one per pattern added for the public flip; git branch names stay allowed.
    clean = {"a.md": "git checkout lane-web && git merge lane-android\nmerge lane-ios into main\n",
             "b.md": "a laneway, the second lane of traffic, lanes on a road\n"}
    assert run(repo(tmp_path, clean), "--public").returncode == 0
    for i, text in enumerate(["the rival projects", "a Rival entry", "the self-audit list", "lane A ruling 4", "lane C's fix",
                              "Lane D found it", "per lane-b rule", "import from ./laneC", "the grading kit",
                              "see STEPHEN-PROMPT.md", "a Codex Cloud slice", "notes in Obsidian", "research/private/x.md"]):
        root = tmp_path / f"case{i}"
        root.mkdir()
        assert run(repo(root, {"c.md": text + "\n"}), "--public").returncode == 1, text
