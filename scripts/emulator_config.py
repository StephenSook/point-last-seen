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

import hashlib
import json
import sys
import tempfile
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


def project_id(root: Path) -> str:
    return "demo-pls-" + hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:8]


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    root = Path(args[0] if args else ".").resolve()
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
