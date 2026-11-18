"""Tests for scripts/emulator_config.py (per-worktree emulator ports)."""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "emulator_config.py"
REPO = Path(__file__).resolve().parents[1]


def make(root):
    out = subprocess.run([sys.executable, "-I", str(SCRIPT), str(root)], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return json.loads(Path(out.stdout.strip()).read_text())


def ports(cfg):
    return {k: v["port"] for k, v in cfg["emulators"].items() if isinstance(v, dict) and "port" in v}


def test_same_root_same_ports_and_no_defaults():
    a, b = make(REPO), make(REPO)
    assert ports(a) == ports(b)
    assert all(20000 <= p < 40000 for p in ports(a).values())
    assert len(set(ports(a).values())) == len(ports(a))
    assert {"auth", "firestore", "storage", "hub", "logging"} <= set(ports(a))


def test_different_worktrees_get_different_ports(tmp_path):
    other = tmp_path / "point-last-seen-web"
    other.mkdir()
    (other / "firebase.json").write_text((REPO / "firebase.json").read_text())
    assert set(ports(make(REPO)).values()).isdisjoint(ports(make(other)).values())


def test_paths_are_absolute_to_the_worktree():
    cfg = make(REPO)
    assert cfg["firestore"]["rules"] == str(REPO / "firestore.rules")
    assert cfg["storage"]["rules"] == str(REPO / "storage.rules")
    assert cfg["firestore"]["indexes"] == str(REPO / "firestore.indexes.json")


def project_id(root):
    out = subprocess.run([sys.executable, "-I", str(SCRIPT), str(root), "--project-id"], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


def test_project_id_is_a_demo_project_per_worktree(tmp_path):
    other = tmp_path / "point-last-seen-ios"
    other.mkdir()
    (other / "firebase.json").write_text((REPO / "firebase.json").read_text())
    a, b = project_id(REPO), project_id(other)
    assert a.startswith("demo-pls-") and b.startswith("demo-pls-") and a != b
    assert a == project_id(REPO) and len(a) <= 30


def tmpdir(root):
    out = subprocess.run([sys.executable, "-I", str(SCRIPT), str(root), "--tmpdir"], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return Path(out.stdout.strip())


def test_tmpdir_is_per_worktree_and_exists(tmp_path):
    # The Storage emulator keeps blobs under $TMPDIR/firebase; a shared folder let one worktree's run
    # delete another's uploads in flight.
    other = tmp_path / "point-last-seen-web"
    other.mkdir()
    (other / "firebase.json").write_text((REPO / "firebase.json").read_text())
    a, b = tmpdir(REPO), tmpdir(other)
    assert a.is_dir() and b.is_dir() and a != b and a == tmpdir(REPO)
