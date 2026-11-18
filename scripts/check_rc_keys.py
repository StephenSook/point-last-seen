#!/usr/bin/env python3
"""Remote Config key check (a CI gate).

Exit 0 only when:
  1. every key in remoteconfig.template.json is read by some client;
  2. every key a client reads is in the template;
  3. no engine number (a name in shared/constants/engine-params.json or walker-params.json, compared in
     snake_case) is in the template: search-model constants must not be remotely tunable.
Keys read in code come from each client's declared defaults (web RC_DEFAULTS, iOS `static let keys`, Android
DEFAULT_MAP) and from direct reads such as getString("key") or getValue(rc, "key"). Finding no key at all in code
is a failure, not a pass.

Usage: python3 -I scripts/check_rc_keys.py [root]
"""
import json
import re
import sys
from pathlib import Path

SOURCES = (("web/src", (".ts", ".tsx")), ("ios", (".swift",)), ("android/app/src/main", (".kt",)))
DECLARED = (
    re.compile(r"export const RC_DEFAULTS = \{(.*?)\}", re.S),
    re.compile(r"static let keys = \[(.*?)\]", re.S),
    re.compile(r"DEFAULT_MAP: Map<String, Any> = mapOf\((.*?)\n\s*\)", re.S),
)
DECLARED_KEY = re.compile(r'"([a-z][a-z0-9_]*)"|^\s*([a-z][a-z0-9_]*):', re.M)
READS = re.compile(r'(?:getString|getBoolean|getNumber|getLong|getDouble)\(\s*"([a-z][a-z0-9_]*)"\s*\)'
                   r'|getValue\([^,()]+,\s*"([a-z][a-z0-9_]*)"\s*\)'
                   r'|configValue\(forKey:\s*"([a-z][a-z0-9_]*)"')


def is_test(path: Path) -> bool:
    name = path.name
    return ".test." in name or name.endswith("Tests.swift") or name.endswith("Test.kt") or "/Tests/" in str(path) or "/test/" in str(path)


def keys_in_code(root: Path) -> set[str]:
    keys: set[str] = set()
    for base, exts in SOURCES:
        for path in sorted((root / base).rglob("*")) if (root / base).is_dir() else []:
            if path.suffix not in exts or is_test(path):
                continue
            text = path.read_text(errors="replace")
            for pattern in DECLARED:
                for block in pattern.findall(text):
                    keys |= {a or b for a, b in DECLARED_KEY.findall(block)}
            keys |= {next(g for g in m if g) for m in READS.findall(text)}
    return keys


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def engine_names(root: Path) -> set[str]:
    names: set[str] = set()
    for f in ("engine-params.json", "walker-params.json"):
        path = root / "shared/constants" / f
        if path.exists():
            names |= {snake(k) for k in json.loads(path.read_text()).get("params", {})}
    return names


def check(root: Path) -> list[str]:
    template = set(json.loads((root / "remoteconfig.template.json").read_text())["parameters"])
    code = keys_in_code(root)
    if not code:
        return ["no Remote Config keys found in code (a client's defaults moved; update this check)"]
    problems = [f"template key {k} is read by no client" for k in sorted(template - code)]
    problems += [f"code reads {k}, which is not in remoteconfig.template.json" for k in sorted(code - template)]
    problems += [f"engine number {k} must not be in Remote Config" for k in sorted(template & engine_names(root))]
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[0] if argv else ".").resolve()
    problems = check(root)
    for p in problems:
        print(f"check_rc_keys: {p}")
    if not problems:
        print(f"check_rc_keys: ok, {len(keys_in_code(root))} keys read in code, all in the template and none an engine number")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
