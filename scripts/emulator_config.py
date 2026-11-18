#!/usr/bin/env python3
"""Write a per-worktree copy of firebase.json for the emulator tests and print its path.

Several worktrees on one machine run the rules suite at the same time; with the ports
in firebase.json they collide ("port taken"). This copy keeps every setting, makes the
file paths absolute to the worktree, and moves every emulator to a port block derived
from the worktree path (20000 to 34999), so two worktrees never share a port.

The demo project id is per worktree too ("demo-pls-" + 8 hex), because the emulator hub
also refuses or warns about "multiple instances of the emulator suite" for one project.

The emulators' temp folder is per worktree as well: the Storage emulator keeps uploaded
blobs under $TMPDIR/firebase, and a shared folder let one worktree's run delete another's.

Usage: python3 -I scripts/emulator_config.py [worktree root]               (prints the config path)
       python3 -I scripts/emulator_config.py [worktree root] --project-id  (prints the project id)
       python3 -I scripts/emulator_config.py [worktree root] --tmpdir      (creates and prints a TMPDIR)
"""

import errno
import os
import hashlib
import json
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EMULATORS = ("auth", "firestore", "storage", "hub", "logging", "functions", "hosting", "eventarc")
BLOCK = 10
FIRST = 20000
BLOCKS = 1500


def port_base(root: Path) -> int:
    h = int(hashlib.sha256(str(root.resolve()).encode()).hexdigest(), 16)
    return FIRST + (h % BLOCKS) * BLOCK


def build(root: Path) -> dict:
    cfg = json.loads((root / "firebase.json").read_text())
    for section in ("firestore", "storage"):
        for key in ("rules", "indexes"):
            if key in cfg.get(section, {}):
                cfg[section][key] = str(root / cfg[section][key])
    for fn in cfg.get("functions", []):
        fn["source"] = str(root / fn["source"])
    if "hosting" in cfg:
        cfg["hosting"]["public"] = str(root / cfg["hosting"]["public"])
    base = port_base(root)
    emu = cfg.setdefault("emulators", {})
    for i, name in enumerate(EMULATORS):
        emu.setdefault(name, {})["port"] = base + i
    emu.setdefault("firestore", {})["websocketPort"] = base + len(EMULATORS)
    emu["ui"] = {"enabled": False}
    return cfg


def busy_ports(root: Path) -> list[int]:
    """Ports in this worktree's block that cannot be bound right now, on 127.0.0.1 or ::1."""
    base, busy = port_base(root), []
    for port in range(base, base + BLOCK):
        for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
            s = socket.socket(family, socket.SOCK_STREAM)
            try:
                s.bind((host, port))
            except OSError as e:
                if e.errno == errno.EADDRINUSE:
                    busy.append(port)
                    break
            finally:
                s.close()
    return busy


def emulator_holders(root: Path) -> list[str]:
    """Running emulator processes whose arguments name a port in this block: emulators:exec can return before
    the Firestore JVM has exited, and a bind probe can miss it while it is still tearing down."""
    base = port_base(root)
    block = {str(p) for p in range(base, base + BLOCK)}
    out = subprocess.run(["ps", "-Ao", "pid=,command="], capture_output=True, text=True).stdout
    held = []
    for line in out.splitlines():
        pid, _, cmd = line.strip().partition(" ")
        tokens = set(cmd.replace("=", " ").split())
        if "emulator" in cmd.lower() and tokens & block and pid != str(os.getpid()):
            held.append(f"pid {pid} ({sorted(tokens & block)[0]})")
    return held


def wait_ports(root: Path, seconds: float) -> int:
    """Waits (bounded) until the block is free, so a lingering socket from the previous run cannot fail the next
    emulator start. Exit 0 when free; exit 1 naming the busy ports when the time runs out."""
    deadline = time.monotonic() + seconds
    while True:
        busy, procs = busy_ports(root), emulator_holders(root)
        if not busy and not procs:
            print("emulator ports free")
            return 0
        if time.monotonic() >= deadline:
            print(f"emulator ports still in use after {seconds:g} s: {busy} {procs}", file=sys.stderr)
            return 1
        time.sleep(1)


def project_id(root: Path) -> str:
    return "demo-pls-" + hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:8]


def main(argv: list[str]) -> int:
    args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--wait-ports")]
    root = Path(args[0] if args else ".").resolve()
    if "--who-holds" in argv:
        # Diagnostics after an emulator bind failure: which processes hold this worktree's ports.
        base = port_base(root)
        print(f"emulator ports {base}-{base + BLOCK - 1}:")
        out = subprocess.run(["lsof", "-nP", f"-iTCP:{base}-{base + BLOCK - 1}"], capture_output=True, text=True)
        print(out.stdout or "(no process holds them now)")
        print("emulator processes naming a block port:", emulator_holders(root) or "none")
        net = subprocess.run(["netstat", "-an", "-p", "tcp"], capture_output=True, text=True).stdout
        ports = {f".{p} " for p in range(base, base + BLOCK)}
        print("kernel sockets on the block (TIME_WAIT and others):", [l.strip() for l in net.splitlines() if any(t in l for t in ports)] or "none")
        return 0
    if "--wait-ports" in argv:
        return wait_ports(root, float(argv[argv.index("--wait-ports") + 1]))
    if "--project-id" in argv:
        print(project_id(root))
        return 0
    out_dir = Path(tempfile.gettempdir()) / f"pls-emulators-{hashlib.sha256(str(root).encode()).hexdigest()[:12]}"
    out_dir.mkdir(parents=True, exist_ok=True)
    if "--tmpdir" in argv:
        tmp = out_dir / "tmp"
        tmp.mkdir(exist_ok=True)
        print(tmp)
        return 0
    out = out_dir / "firebase.json"
    out.write_text(json.dumps(build(root), indent=2) + "\n")
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
