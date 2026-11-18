#!/usr/bin/env python3
"""Write a per-worktree copy of firebase.json for the emulator tests and print its path.

Several worktrees on one machine run the rules suite at the same time; with the ports
in firebase.json they collide ("port taken"). This copy keeps every setting, makes the
file paths absolute to the worktree, and moves every emulator to a port block derived
from the worktree path (20000 to 34999), so two worktrees never share a port.

Usage: python3 -I scripts/emulator_config.py [worktree root]   (prints the config path)
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


def main(argv: list[str]) -> int:
    root = Path(argv[0] if argv else ".").resolve()
    out_dir = Path(tempfile.gettempdir()) / f"pls-emulators-{hashlib.sha256(str(root).encode()).hexdigest()[:12]}"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "firebase.json"
    out.write_text(json.dumps(build(root), indent=2) + "\n")
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
