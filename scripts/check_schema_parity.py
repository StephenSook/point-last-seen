#!/usr/bin/env python3
"""Schema parity check.

Each shared/schemas/*.schema.json carries an "x-parity" map from a JSON pointer
("#" or "#/$defs/Name") to the platform types that mirror it:

  "x-parity": { "#": { "ts": "path/types.ts#ReportReading",
                       "ios": "path/ReportReading.swift#ReportReading",
                       "android": "path/Schemas.kt#ReportReading" } }

For every entry whose file exists, the type's field names must equal the
schema's property names, and for TypeScript a string-enum property's values must
equal the literal union of its field type (inline or a type alias in the same
file). A file that does not exist is "not built" while its platform root
(shared/engine-ts, ios/PLSCore, android/app) is absent; once the root exists a
missing file fails, unless the target is marked "pending:path#Type".
Exit 0 clean, 1 on any mismatch.

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


def ts_field_types(text, name):
    """Field name to its type text, for the TS interface or object type alias `name`."""
    text = strip_comments(text)
    m = re.search(rf"\b(?:interface|type)\s+{re.escape(name)}\b", text)
    if not m:
        return {}
    start = text.index("{", m.end())
    out = {}
    for seg, _ in depth_one_segments(text, start, ";\n", angle=True):
        f = re.match(r"\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:(.*)$", seg, re.S)
        if f:
            out[f.group(1)] = f.group(2).strip()
    return out


LITERAL = re.compile(r'"([^"]*)"|\'([^\']*)\'')


def ts_literals(text, type_text):
    """String literals of an inline union, or of a same-file type alias the field names."""
    t = re.sub(r"\|\s*null\b|\bnull\s*\|", "", type_text).strip().rstrip(";,").strip()
    if re.fullmatch(r"[A-Za-z_$][\w$]*", t):
        a = re.search(rf"\btype\s+{re.escape(t)}\s*=(.*?);", strip_comments(text), re.S)
        if not a:
            return None
        t = a.group(1)
    found = [x or y for x, y in LITERAL.findall(t)]
    return set(found) if found else None


def schema_enum(prop):
    values = list(prop.get("enum", []))
    for alt in prop.get("anyOf", []):
        values += alt.get("enum", [])
    strings = [v for v in values if isinstance(v, str)]
    return set(strings) if strings and len(strings) == len([v for v in values if v is not None]) else None


EXTRACTORS = {"ts": ts_fields, "ios": swift_fields, "android": kotlin_fields}
PLATFORM_ROOTS = {"ts": "shared/engine-ts", "ios": "ios/PLSCore", "android": "android/app"}


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
                node = resolve(schema, pointer)
                props = set(node.get("properties", {}))
            except (KeyError, TypeError):
                print(f"FAIL {name} {pointer}: pointer does not resolve")
                failures += 1
                continue
            for platform in PLATFORMS:
                target = targets.get(platform)
                if target is None:
                    continue
                pending = target.startswith("pending:")
                rel, _, type_name = target.removeprefix("pending:").partition("#")
                file = root / rel
                if not file.exists():
                    if pending:
                        print(f"{name} {pointer} {platform}: pending ({rel})")
                    elif (root / PLATFORM_ROOTS[platform]).exists():
                        print(f"FAIL {name} {pointer} {platform}: {rel} is missing although {PLATFORM_ROOTS[platform]} exists")
                        failures += 1
                    else:
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
                    continue
                enum_bad = []
                if platform == "ts":
                    text = file.read_text()
                    types = ts_field_types(text, type_name)
                    for prop_name, prop in node.get("properties", {}).items():
                        want = schema_enum(prop)
                        got = ts_literals(text, types.get(prop_name, "")) if want else None
                        if want and got is not None and got != want:
                            enum_bad.append(f"{prop_name} missing {sorted(want - got)} extra {sorted(got - want)}")
                if enum_bad:
                    print(f"FAIL {name} {pointer} {platform}: {type_name} enum values differ: {'; '.join(enum_bad)}")
                    failures += 1
                else:
                    print(f"ok {name} {pointer} {platform}: {len(props)} fields")
    status = "FAIL" if failures else "ok"
    print(f"schema parity: {status}, {len(schemas)} schemas, {checked} platform types checked, {failures} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
