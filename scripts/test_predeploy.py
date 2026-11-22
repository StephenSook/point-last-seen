"""scripts/predeploy.sh: every pre-deploy check in one command, and never a deploy."""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "predeploy.sh"


def lines() -> list[str]:
    return SCRIPT.read_text().splitlines()


def test_the_script_parses():
    assert subprocess.run(["bash", "-n", str(SCRIPT)]).returncode == 0


def test_it_never_deploys_and_only_prints_the_deploy_command():
    code = [l for l in lines() if not l.lstrip().startswith("#")]
    runs = [l for l in code if "firebase deploy" in l and not re.match(r'\s*say "', l)]
    assert runs == []
    assert any(re.match(r'\s*say "deploy with:  firebase deploy --only hosting --project \$PROJECT"', l) for l in code)


def test_it_runs_every_gate_in_order():
    # The code only: the header comment names the checks too.
    text = "\n".join(l for l in lines() if not l.lstrip().startswith("#"))
    gates = [
        "git status --porcelain --untracked-files=no",
        "git check-ignore -q .env.local",
        "git merge-base --is-ancestor",
        "npm ci",
        "npm run build -w web",
        'links.index("main") < links.index("base")',
        "e2e/ci.config.ts mapCascade.spec.ts",
        "scripts/judge_seed_check.py",
    ]
    at = [text.find(g) for g in gates]
    assert all(i >= 0 for i in at), dict(zip(gates, at))
    assert at == sorted(at)


def test_it_stops_on_a_changed_tree_before_any_network_call():
    with tempfile.TemporaryDirectory() as d:
        repo = Path(d)
        (repo / "scripts").mkdir()
        shutil.copy(SCRIPT, repo / "scripts" / "predeploy.sh")
        (repo / "a.txt").write_text("one\n")
        git = lambda *a: subprocess.run(["git", "-C", d, *a], check=True, capture_output=True)  # noqa: E731
        git("init", "-q")
        git("-c", "user.email=t@example.invalid", "-c", "user.name=t", "add", ".")
        git("-c", "user.email=t@example.invalid", "-c", "user.name=t", "commit", "-qm", "init")
        (repo / "a.txt").write_text("two\n")
        r = subprocess.run(["bash", "scripts/predeploy.sh"], cwd=d, capture_output=True, text=True)
        assert r.returncode == 1
        assert "predeploy: FAIL: the working tree has changes" in r.stdout
