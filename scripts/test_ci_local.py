"""scripts/ci-local.sh: pick platforms by flag, and a missing tool is reported as NOT RUN with exit 2, never as a pass."""
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).with_name("ci-local.sh")


def run(*args: str, hide: str = ""):
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "HOME": str(Path.home()), "CI_LOCAL_HIDE": hide}
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
