"""scripts/ci-local.sh: pick platforms by flag, and a missing tool is reported as NOT RUN with exit 2, never as a pass."""
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).with_name("ci-local.sh")


def run(*args: str, hide: str = ""):
    # PLS_HEAVY_LOCK=1: these runs are light, and ci-local may already hold the machine's heavy-suite lock.
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "HOME": str(Path.home()), "CI_LOCAL_HIDE": hide,
           "PLS_HEAVY_LOCK": "1"}
    return subprocess.run(["bash", str(SCRIPT), *args], capture_output=True, text=True, env=env, timeout=120)


def test_help_names_every_platform_flag():
    r = run("--help")
    assert r.returncode == 0
    for flag in ("--gates", "--ts", "--rules", "--web", "--ios", "--android"):
        assert flag in r.stdout


def test_an_unknown_flag_is_refused():
    r = run("--everything")
    assert r.returncode == 64
    assert "unknown option" in r.stdout


def test_a_missing_tool_is_not_run_and_never_a_pass():
    r = run("--ios", hide="swift")
    assert r.returncode == 2, r.stdout
    assert "ios: NOT RUN, swift is not installed" in r.stdout
    assert "all checks passed" not in r.stdout
    assert "did NOT run: ios (swift)" in r.stdout


# Every command a workflow runs must also run in ci-local, or "local mirror green" can pass with a CI check skipped.
ROOT = SCRIPT.parents[1]
WORKFLOWS = ("ci", "engine", "rules", "web", "swift", "android")
# Runner setup only CI needs (a local machine has these installed).
SETUP = ("pip install -r requirements-dev.txt", "curl -sSfL -o", "| sha256sum -c -", "tar -xzf", "npm ci",
         "npm install -g firebase-tools@", "npx playwright install --with-deps", "sudo apt-get install")
# The same check written two ways: CI regenerates the vectors and diffs them, ci-local runs the generator's --check.
SAME = {"-I tools/vectors/make_vectors.py": "-I tools/vectors/make_vectors.py --check",
        "git diff --exit-code -- shared/test-vectors/search.json shared/test-vectors/prior.json shared/test-vectors/urgency.json":
            "-I tools/vectors/make_vectors.py --check"}


def run_commands(text: str) -> list[str]:
    import re
    lines, out, i = text.splitlines(), [], 0
    while i < len(lines):
        m = re.match(r"^(\s*)(?:- )?run:\s*(.*)$", lines[i])
        if m and m.group(2).strip() in ("|", ">"):
            ind, i = len(m.group(1)), i + 1
            while i < len(lines) and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip()) > ind):
                if lines[i].strip() and not lines[i].strip().startswith("#"):
                    out.append(lines[i].strip())
                i += 1
            continue
        if m:
            out.append(m.group(2).strip())
        i += 1
    return out


def normalize(cmd: str) -> str:
    import re
    cmd = re.sub(r"\$\{\{.*?\}\}", "", cmd).strip().strip("'")
    cmd = cmd.replace('"$RUNNER_TEMP/gitleaks"', "gitleaks").replace('"$PY" ', "").replace("python3 ", "").replace("python ", "")
    cmd = re.sub(r"^(?:[A-Z_]+=\S+\s+)+", "", cmd)
    return " ".join(cmd.split())


def unmirrored(workflow_texts: list[str], local: str) -> list[str]:
    local_n = " ".join(normalize(line) for line in local.splitlines())
    missing = []
    for text in workflow_texts:
        for cmd in run_commands(text):
            if any(s in cmd for s in SETUP):
                continue
            n = normalize(cmd)
            if SAME.get(n, n) not in local_n:
                missing.append(cmd)
    return missing


def test_every_workflow_command_runs_in_ci_local():
    texts = [(ROOT / ".github/workflows" / f"{w}.yml").read_text() for w in WORKFLOWS]
    assert sum(len(run_commands(t)) for t in texts) >= 30
    assert unmirrored(texts, SCRIPT.read_text()) == []


def pytest_targets(workflow_texts: list[str]) -> set[str]:
    """Every file or folder a workflow's pytest command names."""
    named = set()
    for text in workflow_texts:
        for cmd in run_commands(text):
            words = cmd.split()
            if "pytest" in words:
                named.update(w.rstrip("/") for w in words[words.index("pytest") + 1:] if not w.startswith("-"))
    return named


def unlisted_tests(files: list[str], named: set[str]) -> list[str]:
    """Python test files no pytest command names, by path or by a parent folder."""
    def listed(f: str) -> bool:
        parts = f.split("/")
        return any("/".join(parts[:i]) in named for i in range(1, len(parts) + 1))
    return sorted(f for f in files if not listed(f))


def test_every_python_test_file_runs_in_ci():
    # The pytest lists name their files, so a new test file runs nowhere until it is added (review: three
    # files under tools/extras ran only by hand). Every test file git would ship must be named.
    files = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "*test_*.py"],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    assert len(files) >= 20
    texts = [(ROOT / ".github/workflows" / f"{w}.yml").read_text() for w in WORKFLOWS]
    assert unlisted_tests(files, pytest_targets(texts)) == []


def test_an_unlisted_python_test_file_is_found():
    wf = "jobs:\n  x:\n    steps:\n      - run: python3 -I -m pytest scripts/test_a.py tools/b/ -q\n"
    named = pytest_targets([wf])
    assert unlisted_tests(["scripts/test_a.py", "tools/b/test_c.py", "tools/d/test_e.py"], named) == ["tools/d/test_e.py"]


def test_a_workflow_step_missing_from_ci_local_is_found():
    wf = "jobs:\n  x:\n    steps:\n      - run: npm test -w web\n      - run: |\n          npx brand-new-check\n"
    assert unmirrored([wf], "npm test -w web\n") == ["npx brand-new-check"]


# The heavy-suite slots: two full suites at most run on this machine at once. lockf exists on this Mac, not on CI.
import shutil
import pytest

needs_lockf = pytest.mark.skipif(shutil.which("lockf") is None, reason="lockf is a macOS tool; the slots apply only there")


def run_unlocked(*args: str, lock_dir: Path, wrap: list[str] | None = None, step_s: str = "300", timeout: int = 60):
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "HOME": str(Path.home()), "CI_LOCAL_HIDE": "swift",
           "PLS_HEAVY_LOCK_DIR": str(lock_dir), "PLS_HEAVY_LOCK_STEP_S": step_s}
    return subprocess.run([*(wrap or []), "bash", str(SCRIPT), *args], capture_output=True, text=True, env=env, timeout=timeout)


def hold(lock: Path, seconds: int):
    holder = subprocess.Popen(["lockf", "-k", str(lock), "sleep", str(seconds)])
    import time
    for _ in range(50):
        if subprocess.run(["lockf", "-t", "0", str(lock), "true"]).returncode == 75:
            return holder
        time.sleep(0.1)
    raise AssertionError(f"could not hold {lock}")


@needs_lockf
def test_a_run_already_inside_a_heavy_suite_lockf_does_not_wait_on_itself(tmp_path):
    # A hand-wrapped run used to deadlock: the outer lockf held the lock and the script waited on it forever.
    r = run_unlocked("--ios", lock_dir=tmp_path, wrap=["lockf", "-k", str(tmp_path / "heavy-suite-1.lock")])
    assert r.returncode == 2, r.stdout
    assert "ios: NOT RUN, swift is not installed" in r.stdout


@needs_lockf
def test_with_one_slot_busy_the_run_takes_the_other_at_once(tmp_path):
    holder = hold(tmp_path / "heavy-suite-1.lock", 30)
    try:
        r = run_unlocked("--ios", lock_dir=tmp_path, timeout=20)
        assert r.returncode == 2, r.stdout
        assert "waiting" not in r.stdout
    finally:
        holder.kill()


@needs_lockf
def test_with_both_slots_busy_it_names_the_holder_while_it_waits_then_runs(tmp_path):
    first = hold(tmp_path / "heavy-suite-1.lock", 3)
    second = hold(tmp_path / "heavy-suite-2.lock", 30)
    try:
        r = run_unlocked("--ios", lock_dir=tmp_path, step_s="1", timeout=30)
        assert r.returncode == 2, r.stdout
        assert "both heavy-suite slots are busy" in r.stdout and f"held by PID {first.pid}" in r.stdout
    finally:
        first.kill()
        second.kill()


def test_the_slots_are_taken_after_the_options_are_read():
    text = SCRIPT.read_text()
    assert text.index('heavy.sh" bash "$SELF" "$@"') > text.index('*) echo "ci-local: unknown option')


HEAVY = SCRIPT.with_name("heavy.sh")


@needs_lockf
def test_heavy_runs_a_direct_command_in_a_slot_and_passes_its_exit_code_back(tmp_path):
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "PLS_HEAVY_LOCK_DIR": str(tmp_path), "PLS_HEAVY_LOCK_STEP_S": "1"}
    ok = subprocess.run(["bash", str(HEAVY), "bash", "-c", 'echo "in=$PLS_HEAVY_LOCK"; exit 3'], capture_output=True, text=True, env=env, timeout=30)
    assert ok.returncode == 3 and "in=1" in ok.stdout
    first, second = hold(tmp_path / "heavy-suite-1.lock", 3), hold(tmp_path / "heavy-suite-2.lock", 30)
    try:
        waited = subprocess.run(["bash", str(HEAVY), "true"], capture_output=True, text=True, env=env, timeout=30)
        assert waited.returncode == 0 and f"held by PID {first.pid}" in waited.stdout
    finally:
        first.kill()
        second.kill()
    nested = subprocess.run(["lockf", "-k", str(tmp_path / "heavy-suite-1.lock"), "bash", str(HEAVY), "true"],
                            capture_output=True, text=True, env=env, timeout=30)
    assert nested.returncode == 0
    assert subprocess.run(["bash", str(HEAVY)], capture_output=True, text=True, env=env).returncode == 64
