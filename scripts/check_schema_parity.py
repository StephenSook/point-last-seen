#!/usr/bin/env python3
"""Schema parity check.

Each shared/schemas/*.schema.json carries an "x-parity" map from a JSON pointer
("#" or "#/$defs/Name") to the platform types that mirror it:

  "x-parity": { "#": { "ts": "path/types.ts#ReportReading",
                       "ios": "path/ReportReading.swift#ReportReading",
                       "android": "path/Schemas.kt#ReportReading" } }

For every entry whose file exists, the type's field names must equal the
schema's property names. A file that does not exist yet is reported as
"not built" and does not fail. Exit 0 clean, 1 on any mismatch.

Usage: python3 -I scripts/check_schema_parity.py [root]
"""

import json
import re
import sys
from pathlib import Path

PLATFORMS = ("ts", "ios", "android")
OPEN, CLOSE = "{[(", "}])"


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def depth_one_segments(text, start, separators, angle=False):
    """Split the bracket body that opens at text[start] into depth-1 segments.
    Returns (segment_text, opened_brace) pairs; opened_brace marks a segment that
    opened a nested { } block (a Swift computed property or observer)."""
    depth, seg, deeper, out, i = 0, "", False, [], start
    quote = None
    while i < len(text):
        c = text[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
            if depth == 1:
                seg += c
            i += 1
            continue
        if c in "\"'`":
            quote = c
            if depth == 1:
                seg += c
            i += 1
            continue
        is_open = c in OPEN or (angle and c == "<")
        is_close = c in CLOSE or (angle and c == ">" and text[i - 1] != "=")
        if is_open:
            depth += 1
            if depth == 1:
                i += 1
                continue
            if c == "{":
                deeper = True
        elif is_close:
            depth -= 1
            if depth == 0:
                out.append((seg, deeper))
                return out
        elif depth == 1 and c in separators:
            out.append((seg, deeper))
            seg, deeper = "", False
            i += 1
            continue
        if depth == 1:
            seg += c
        i += 1
    raise ValueError("unbalanced brackets")


def ts_fields(text, name):
    text = strip_comments(text)
    m = re.search(rf"\b(?:interface|type)\s+{re.escape(name)}\b", text)
    if not m:
        return None
    start = text.index("{", m.end())
    fields = set()
    for seg, _ in depth_one_segments(text, start, ";,\n", angle=True):
        f = re.match(r"\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:", seg)
        if f:
            fields.add(f.group(1))
    return fields


def swift_fields(text, name):
    text = strip_comments(text)
    m = re.search(rf"\b(?:struct|class)\s+{re.escape(name)}\b", text)
    if not m:
        return None
    start = text.index("{", m.end())
    fields = set()
    for seg, deeper in depth_one_segments(text, start, ";\n"):
        if re.search(r"\bstatic\b", seg):
            continue
        f = re.match(r"\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|internal|fileprivate|open|package)"
                     r"(?:\(set\))?\s+)*(let|var)\s+([A-Za-z_]\w*)\s*:", seg)
        if f and not (f.group(1) == "var" and deeper):
            fields.add(f.group(2))
    return fields


def kotlin_fields(text, name):
    text = strip_comments(text)
    m = re.search(rf"\bclass\s+{re.escape(name)}\b", text)
    if not m:
        return None
    start = text.index("(", m.end())
    fields = set()
    for seg, _ in depth_one_segments(text, start, ",", angle=True):
        f = re.match(r"\s*(?:@\S+\s+)*(?:(?:private|public|internal|override)\s+)*(?:val|var)\s+([A-Za-z_]\w*)\s*:", seg)
        if f:
            fields.add(f.group(1))
    return fields


EXTRACTORS = {"ts": ts_fields, "ios": swift_fields, "android": kotlin_fields}


def resolve(schema, pointer):
    if pointer == "#":
        return schema
    parts = pointer.lstrip("#/").split("/")
    node = schema
    for p in parts:
        node = node[p]
    return node


def main(root):
    root = Path(root)
    schemas = sorted((root / "shared" / "schemas").glob("*.schema.json"))
    if not schemas:
        print("schema parity: no schemas found under shared/schemas")
        return 1
    failures, checked = 0, 0
    for path in schemas:
        name = path.name.removesuffix(".schema.json")
        schema = json.loads(path.read_text())
        parity = schema.get("x-parity")
        if not parity:
            print(f"FAIL {name}: no x-parity map")
            failures += 1
            continue
        for pointer, targets in parity.items():
            try:
                props = set(resolve(schema, pointer).get("properties", {}))
            except (KeyError, TypeError):
                print(f"FAIL {name} {pointer}: pointer does not resolve")
                failures += 1
                continue
            for platform in PLATFORMS:
                target = targets.get(platform)
                if target is None:
                    continue
                rel, _, type_name = target.partition("#")
                file = root / rel
                if not file.exists():
                    print(f"{name} {pointer} {platform}: not built ({rel})")
                    continue
                found = EXTRACTORS[platform](file.read_text(), type_name)
                if found is None:
                    print(f"FAIL {name} {pointer} {platform}: type {type_name} not found in {rel}")
                    failures += 1
                    continue
                missing, extra = sorted(props - found), sorted(found - props)
                checked += 1
                if missing or extra:
                    print(f"FAIL {name} {pointer} {platform}: {type_name} in {rel} missing {missing} extra {extra}")
                    failures += 1
                else:
                    print(f"ok {name} {pointer} {platform}: {len(props)} fields")
    status = "FAIL" if failures else "ok"
    print(f"schema parity: {status}, {len(schemas)} schemas, {checked} platform types checked, {failures} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
