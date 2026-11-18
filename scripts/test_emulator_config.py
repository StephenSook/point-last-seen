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
