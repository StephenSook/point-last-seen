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


def ports_of(root):
    return sorted(ports(make(root)).values())


def wait(root, seconds):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), str(root), "--wait-ports", str(seconds)],
                          capture_output=True, text=True, timeout=seconds + 30)


def holder(port):
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", port))
    s.listen()
    return s


def worktree(tmp_path, name):
    # Pick a name whose port block is free right now, so a live worktree's emulator cannot collide with it.
    for i in range(50):
        other = tmp_path / f"{name}-{i}"
        other.mkdir()
        (other / "firebase.json").write_text((REPO / "firebase.json").read_text())
        if wait(other, 0).returncode == 0:
            return other
    raise AssertionError("no free emulator port block found for a test worktree")


def test_wait_ports_passes_at_once_when_the_block_is_free(tmp_path):
    out = wait(worktree(tmp_path, "free-block"), 5)
    assert out.returncode == 0, out.stdout + out.stderr


def test_wait_ports_fails_and_names_a_port_that_stays_taken(tmp_path):
    # A lingering emulator socket from the previous run made the Firestore WebChannel bind fail.
    root = worktree(tmp_path, "taken-block")
    port = ports(make(root))["firestore"]
    s = holder(port)
    try:
        out = wait(root, 2)
    finally:
        s.close()
    assert out.returncode == 1
    assert str(port) in out.stdout + out.stderr


def test_wait_ports_waits_until_the_port_is_released(tmp_path):
    import threading
    import time
    root = worktree(tmp_path, "released-block")
    s = holder(ports(make(root))["auth"])
    threading.Timer(1.5, s.close).start()
    t0 = time.monotonic()
    out = wait(root, 20)
    assert out.returncode == 0, out.stdout + out.stderr
    assert time.monotonic() - t0 >= 1.0


def test_wait_ports_sees_a_socket_held_on_the_wildcard_address(tmp_path):
    # Lane B: the Firestore emulator's WebChannel server failed to bind its port right after "ports free";
    # Java binds the wildcard, so a socket held there must also count as busy.
    import socket
    root = worktree(tmp_path, "wildcard-block")
    port = ports(make(root))["firestore"]
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("0.0.0.0", port))
    s.listen()
    try:
        out = wait(root, 2)
    finally:
        s.close()
    assert out.returncode == 1
    assert str(port) in out.stdout + out.stderr


def test_who_holds_names_the_block_range(tmp_path):
    root = worktree(tmp_path, "who-holds")
    ps = ports_of(root)
    out = subprocess.run([sys.executable, "-I", str(SCRIPT), str(root), "--who-holds"], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    assert f"{min(ps)}-{min(ps) + 9}" in out.stdout


def test_wait_ports_also_waits_for_an_emulator_process_that_names_a_block_port(tmp_path):
    # emulators:exec can return before the Firestore JVM has exited; a bind probe can miss it while it is still
    # tearing down, so a running emulator process whose arguments name a port in the block also counts as busy.
    root = worktree(tmp_path, "process-block")
    port = ports(make(root))["firestore"]
    proc = subprocess.Popen([sys.executable, "-I", "-c", "import time; time.sleep(30)", "fake-firestore-emulator", "--port", str(port)])
    try:
        out = wait(root, 2)
    finally:
        proc.kill()
        proc.wait()
    assert out.returncode == 1
    assert str(proc.pid) in out.stdout + out.stderr
