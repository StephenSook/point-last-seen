"""Publish the camera read check (spike S-CAM) for the judge page.

Copies only the allowlisted fields from docs/evidence/spikes/SCAM.json to web/public/extras/scam.json. The judge
page recomputes every verdict from these fields, so nothing else is needed. A source that carries a name field or
a file path is refused, because the published file must hold no clip, frame, file name, person's name or address.

    python3 -I tools/extras/publish_scam.py              # write the copy
    python3 -I tools/extras/publish_scam.py --check      # exit 1 when the copy is missing or differs

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

FILE_FIELDS = ("spike", "runAt", "model", "clipSource", "n", "passed", "clips")
CLIP_FIELDS = ("id", "lighting", "timeErrorS", "bearingErrorDeg", "nightColorsUnknown", "pass", "missReasons")
CLIP_SOURCES = ("staged", "stock")
DEFAULT_SOURCE = "docs/evidence/spikes/SCAM.json"
DEFAULT_OUT = "web/public/extras/scam.json"

NAME_KEY = re.compile(r"name|path|file|folder", re.IGNORECASE)
# A model id may hold a slash ("publishers/.../models/..."); it is the one string checked for names only.
PATH_EXEMPT_KEYS = ("model",)
PATH_VALUE = re.compile(r"[/\\]|\.(mov|mp4|m4v|avi|mkv|webm|jpe?g|png|heic)$", re.IGNORECASE)


def _refuse_names_and_paths(node: object, where: str) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            if NAME_KEY.search(str(key)):
                raise ValueError(f"{where} has a name or a file path field: {key}")
            if key in PATH_EXEMPT_KEYS and isinstance(value, str):
                continue
            _refuse_names_and_paths(value, f"{where}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            _refuse_names_and_paths(value, f"{where}[{i}]")
    elif isinstance(node, str) and PATH_VALUE.search(node):
        raise ValueError(f"{where} holds a name or a file path: {node!r}")


def publish(source: dict) -> dict:
    """The published copy: allowlisted fields only, in a fixed order. Raises ValueError on a refused source."""
    if not isinstance(source, dict) or not isinstance(source.get("clips"), list):
        raise ValueError("source is not a camera check result")
    _refuse_names_and_paths(source, "source")
    if source.get("clipSource") not in CLIP_SOURCES:
        raise ValueError(f"source must say where its clips came from: clipSource is one of {', '.join(CLIP_SOURCES)}")
    for key in FILE_FIELDS:
        if key not in source:
            raise ValueError(f"source is missing {key}")
    clips = []
    for i, clip in enumerate(source["clips"]):
        if not isinstance(clip, dict):
            raise ValueError(f"clip {i} is not an object")
        missing = [k for k in CLIP_FIELDS if k not in clip]
        if missing:
            raise ValueError(f"clip {clip.get('id', i)} is missing {', '.join(missing)}")
        clips.append({k: clip[k] for k in CLIP_FIELDS})
    out = {k: source[k] for k in FILE_FIELDS}
    out["clips"] = clips
    return out


def _text(obj: dict) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", default=DEFAULT_SOURCE)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--check", action="store_true", help="exit 1 when the published copy is missing or differs")
    args = ap.parse_args(argv)
    try:
        published = publish(json.loads(Path(args.source).read_text(encoding="utf-8")))
    except (OSError, ValueError) as e:
        print(f"publish_scam: refused: {e}", file=sys.stderr)
        return 2
    out = Path(args.out)
    if args.check:
        if not out.exists():
            print(f"publish_scam: {out} is missing; run without --check", file=sys.stderr)
            return 1
        if json.loads(out.read_text(encoding="utf-8")) != published:
            print(f"publish_scam: {out} differs from {args.source}; run without --check", file=sys.stderr)
            return 1
        print(f"publish_scam: {out} matches {args.source}")
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(_text(published), encoding="utf-8")
    print(f"publish_scam: wrote {out} ({len(published['clips'])} clips)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
