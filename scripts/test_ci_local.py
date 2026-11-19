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
         "npm install -g firebase-tools@", "npx playwright install --with-deps")
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


def test_a_workflow_step_missing_from_ci_local_is_found():
    wf = "jobs:\n  x:\n    steps:\n      - run: npm test -w web\n      - run: |\n          npx brand-new-check\n"
    assert unmirrored([wf], "npm test -w web\n") == ["npx brand-new-check"]


def test_a_full_run_takes_the_machine_wide_heavy_suite_lock_unless_it_already_holds_it():
    # Several worktrees on one machine: only one heavy suite runs at a time, or timing-based browser tests flake.
    text = SCRIPT.read_text()
    assert 'exec lockf -k /tmp/heavy-suite.lock bash "$SELF" "$@"' in text
    assert 'if [ -z "${PLS_HEAVY_LOCK:-}" ]' in text and "export PLS_HEAVY_LOCK=1" in text
    # The lock comes after the options are read, so --help and a bad option never wait for it.
    assert text.index("exec lockf") > text.index('*) echo "ci-local: unknown option')
