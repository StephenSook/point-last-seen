"""Checks an iPhone build's privacy manifests against the App Store privacy label.

Usage: python3 -I scripts/check_privacy_label.py <path to PLS.app> <path to ios/app-privacy-label.json>

Apple reads every PrivacyInfo.xcprivacy a build bundles, the app's own and each SDK's. This fails (exit 1) when
any of them declares a data type the label does not list, links to the user data the label says is not linked,
or uses data for tracking; when the app's own manifest does not declare exactly the label's types; or when the
build bundles no manifest at all. Standard library only.
"""
import json
import plistlib
import sys
from pathlib import Path

TYPE = "NSPrivacyCollectedDataType"
PURPOSE = "NSPrivacyCollectedDataTypePurpose"


def collected(path):
    with open(path, "rb") as f:
        p = plistlib.load(f)
    out = []
    for t in p.get("NSPrivacyCollectedDataTypes", []):
        out.append({
            "type": t.get(TYPE, "").removeprefix(TYPE),
            "linked": bool(t.get("NSPrivacyCollectedDataTypeLinked")),
            "tracking": bool(t.get("NSPrivacyCollectedDataTypeTracking")),
            "purposes": [x.removeprefix(PURPOSE) for x in t.get("NSPrivacyCollectedDataTypePurposes", [])],
        })
    return bool(p.get("NSPrivacyTracking")), out


def main(app, label_path):
    label = json.loads(Path(label_path).read_text())
    types = label["types"]
    manifests = sorted(Path(app).rglob("PrivacyInfo.xcprivacy"))
    problems = []
    if not manifests:
        problems.append("no privacy manifest in the build")
    own = Path(app) / "PrivacyInfo.xcprivacy"
    if not own.is_file():
        problems.append("the app's own privacy manifest is missing")
    for m in manifests:
        where = str(m.relative_to(app).parent) if m.parent != Path(app) else "the app"
        tracking, entries = collected(m)
        if tracking:
            problems.append(f"{where}: declares tracking")
        for e in entries:
            name = e["type"]
            if name not in types:
                problems.append(f"{where}: collects {name}, which the label does not list")
                continue
            if e["linked"] and not types[name]["linked"]:
                problems.append(f"{where}: links {name} to the user, but the label says not linked")
            if e["tracking"]:
                problems.append(f"{where}: uses {name} for tracking")
            missing = [p for p in e["purposes"] if p not in types[name]["purposes"]]
            if missing:
                problems.append(f"{where}: {name} is for {', '.join(missing)}, which the label does not tick")
    if own.is_file():
        _, entries = collected(own)
        declared = {e["type"]: e for e in entries}
        for name, want in types.items():
            if name not in declared:
                problems.append(f"the app's own manifest does not declare {name}, which the label lists")
            elif declared[name]["linked"] != want["linked"]:
                problems.append(f"the app's own manifest has {name} linked={declared[name]['linked']}, the label {want['linked']}")
    if problems:
        for p in problems:
            print(f"check_privacy_label: FAIL {p}")
        return 1
    print(f"check_privacy_label: ok {len(manifests)} manifests, {len(types)} label types, nothing collected off the label")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        sys.exit(64)
    sys.exit(main(sys.argv[1], sys.argv[2]))
