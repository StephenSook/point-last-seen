"""Tests for scripts/check_rc_keys.py: the Remote Config template and the keys read in code agree, and no engine
number is remotely tunable."""
import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name("check_rc_keys.py")
REPO = Path(__file__).resolve().parents[1]


def tmp_repo(root: Path, template_keys=("kill_cloud", "cloud_model_web"), web_keys=("kill_cloud", "cloud_model_web")) -> Path:
    (root / "shared/constants").mkdir(parents=True)
    (root / "shared/constants/engine-params.json").write_text(json.dumps({"params": {"sweepWidthFactor": 1.6}}))
    (root / "shared/constants/walker-params.json").write_text(json.dumps({"params": {"defaultN": 10000}}))
    params = {k: {"defaultValue": {"value": "x"}, "valueType": "STRING", "description": "d"} for k in template_keys}
    (root / "remoteconfig.template.json").write_text(json.dumps({"parameters": params}))
    (root / "web/src/config").mkdir(parents=True)
    body = "\n".join(f"  {k}: false," for k in web_keys)
    (root / "web/src/config/rc.ts").write_text(f"export const RC_DEFAULTS = {{\n{body}\n}} as const;\n")
    return root


def run(root: Path):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), str(root)], capture_output=True, text=True)


def test_agreeing_keys_pass(tmp_path):
    out = run(tmp_repo(tmp_path))
    assert out.returncode == 0, out.stdout + out.stderr


def test_unread_key_fails(tmp_path):
    out = run(tmp_repo(tmp_path, template_keys=("kill_cloud", "cloud_model_web", "ghost_key")))
    assert out.returncode == 1 and "ghost_key" in out.stdout


def test_unknown_key_in_code_fails(tmp_path):
    root = tmp_repo(tmp_path)
    (root / "web/src/config/extra.ts").write_text('const v = rc.getString("not_in_template");\n')
    out = run(root)
    assert out.returncode == 1 and "not_in_template" in out.stdout


def test_engine_number_in_template_fails(tmp_path):
    root = tmp_repo(tmp_path, template_keys=("kill_cloud", "cloud_model_web", "sweep_width_factor"),
                    web_keys=("kill_cloud", "cloud_model_web", "sweep_width_factor"))
    out = run(root)
    assert out.returncode == 1 and "sweep_width_factor" in out.stdout


def test_a_repo_with_no_client_defaults_found_fails_instead_of_passing_empty(tmp_path):
    root = tmp_repo(tmp_path)
    (root / "web/src/config/rc.ts").write_text("// moved\n")
    out = run(root)
    assert out.returncode == 1 and "no Remote Config keys found in code" in out.stdout


def test_this_repo_passes():
    out = run(REPO)
    assert out.returncode == 0, out.stdout + out.stderr
