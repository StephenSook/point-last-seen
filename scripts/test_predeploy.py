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
        "--include='*.js' --include='*.mjs' --include='*.css' sourceMappingURL web/dist",
        'links.index("main") < links.index("base")',
        "e2e/ci.config.ts mapCascade.spec.ts",
        "scripts/judge_seed_check.py",
        "firebase crashlytics:sourcemap:upload",
        "find web/dist -name '*.map' -print -quit",
    ]
    at = [text.find(g) for g in gates]
    assert all(i >= 0 for i in at), dict(zip(gates, at))
    assert at == sorted(at)


def test_its_steps_are_numbered_in_order():
    steps = [m.groups() for m in re.finditer(r'say "(\d+)/(\d+) ', SCRIPT.read_text())]
    nums = sorted({int(n) for n, _ in steps})
    assert nums == list(range(1, 11)), steps
    assert {total for _, total in steps} == {"10"}, steps
    assert [int(n) for n, _ in steps] == sorted(int(n) for n, _ in steps)


def test_the_source_map_upload_is_the_last_step_and_names_the_bundles_commit():
    # The only write: it runs after every check passes, under the commit the bundle reports, and deletes the maps.
    upload = [l.strip() for l in lines() if "crashlytics:sourcemap:upload" in l and not l.lstrip().startswith("#")]
    assert len(upload) == 1, upload
    for part in ['--project "$PROJECT"', '--app "$APP_ID"', '--app-version "$BUNDLE_SHA"', "--clean web/dist"]:
        assert part in upload[0], part
    text = SCRIPT.read_text()
    assert '[ "$BUNDLE_SHA" = "$HEAD_SHA" ]' in text
    assert text.index("crashlytics:sourcemap:upload") > text.index("scripts/judge_seed_check.py \"$PROJECT\"")
    # The CLI exits 0 when it finds no map to upload, so the step needs at least one map before it runs.
    assert text.index('[ "$MAPS" -gt 0 ] || fail') < text.index("firebase crashlytics:sourcemap:upload")


def test_an_unreadable_dist_is_a_failure_not_a_pass():
    # grep exits 2 when it cannot search: that must fail the step, never read as "no source map named".
    text = SCRIPT.read_text()
    # macOS grep with --include skips a missing directory and exits 1, so the step first requires a built script.
    floor = text.index("""[ -n "$(find web/dist/assets -name '*.js' -print -quit)" ] || fail""")
    assert text.index('say "5/10') < floor < text.index("sourceMappingURL web/dist")
    block = text[text.index("sourceMappingURL web/dist") :]
    assert re.search(r"case \$\? in\s*0\) fail [^;]+;;\s*1\) ;;\s*\*\) fail [^;]+;;\s*esac", block), block[:400]


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
