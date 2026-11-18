"""Tests for scripts/check_schema_parity.py on throwaway trees."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent / "check_schema_parity.py"
REPO = Path(__file__).resolve().parents[1]

TS_FILE = "shared/engine-ts/src/types.ts"
SWIFT_FILE = "ios/PLSCore/Sources/PLSCore/ReportReading.swift"
KT_FILE = "android/app/src/main/java/app/pointlastseen/family/data/Schemas.kt"
FIELDS = ["kind", "segmentIds", "method"]


def run(root):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), str(root)], capture_output=True, text=True)


def write(root, rel, text):
    p = Path(root) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


def write_schema(root, name, fields, parity):
    schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object",
              "additionalProperties": False, "required": fields,
              "properties": {f: {"type": "string"} for f in fields}, "x-parity": {"#": parity}}
    write(root, f"shared/schemas/{name}.schema.json", json.dumps(schema))


def write_ts(root, fields):
    body = "\n".join(f"  {f}: string;" for f in fields)
    write(root, TS_FILE, f"export interface ReportReading {{\n{body}\n}}\n")


def write_swift(root, fields):
    body = "\n".join(f"    public var {f}: String" for f in fields)
    write(root, SWIFT_FILE, "public struct ReportReading: Codable {\n" + body
          + "\n    public var isOK: Bool { true }\n    enum CodingKeys: String, CodingKey { case a }\n}\n")


PARITY = {"ts": f"{TS_FILE}#ReportReading", "ios": f"{SWIFT_FILE}#ReportReading",
          "android": f"{KT_FILE}#ReportReading"}


@pytest.fixture
def tmp_repo(tmp_path):
    write_schema(tmp_path, "report-reading", FIELDS, PARITY)
    write_ts(tmp_path, FIELDS)
    write_swift(tmp_path, FIELDS)
    return tmp_path


def add_schema_field(root, name, field):
    p = Path(root) / f"shared/schemas/{name}.schema.json"
    s = json.loads(p.read_text())
    s["properties"][field + "Extra"] = {"type": "string"}
    p.write_text(json.dumps(s))


def test_parity_passes_when_fields_match(tmp_repo):
    out = run(tmp_repo)
    assert out.returncode == 0, out.stdout
    assert "android: not built" in out.stdout


def test_parity_fails_on_a_missing_field(tmp_repo):
    add_schema_field(tmp_repo, "report-reading", "method")
    out = run(tmp_repo)
    assert out.returncode == 1 and "methodExtra" in out.stdout


def test_parity_fails_on_an_extra_field_in_a_type(tmp_repo):
    write_ts(tmp_repo, FIELDS + ["surprise"])
    out = run(tmp_repo)
    assert out.returncode == 1 and "surprise" in out.stdout and "ts" in out.stdout


def test_parity_reports_unbuilt_platform_without_failing(tmp_path):
    write_schema(tmp_path, "report-reading", FIELDS, PARITY)
    write_ts(tmp_path, FIELDS)
    out = run(tmp_path)
    assert out.returncode == 0 and "android: not built" in out.stdout and "ios: not built" in out.stdout


def test_missing_type_in_an_existing_file_fails(tmp_repo):
    write(tmp_repo, TS_FILE, "export interface Other { a: string }\n")
    out = run(tmp_repo)
    assert out.returncode == 1 and "ReportReading" in out.stdout


def test_kotlin_data_class_fields_are_read(tmp_repo):
    write(tmp_repo, KT_FILE, "data class ReportReading(\n  val kind: String,\n  val segmentIds: List<String>,\n"
                             "  val method: String = \"visual\",\n)\n")
    out = run(tmp_repo)
    assert out.returncode == 0, out.stdout
    write(tmp_repo, KT_FILE, "data class ReportReading(val kind: String, val method: String)\n")
    assert run(tmp_repo).returncode == 1


def test_ts_nested_braces_and_optional_fields(tmp_repo):
    write(tmp_repo, TS_FILE, "export type ReportReading = {\n  readonly kind: 'a' | 'b';\n"
                             "  segmentIds?: { inner: number }[];\n  method: Record<string, { x: number }>;\n};\n")
    assert run(tmp_repo).returncode == 0


def test_schema_without_parity_map_fails(tmp_path):
    write(tmp_path, "shared/schemas/grid.schema.json", json.dumps({"type": "object", "properties": {"a": {}}}))
    out = run(tmp_path)
    assert out.returncode == 1 and "x-parity" in out.stdout


def test_no_schemas_fails(tmp_path):
    assert run(tmp_path).returncode == 1


def test_real_repo_schemas_pass():
    out = run(REPO)
    assert out.returncode == 0, out.stdout


def test_swift_array_and_optional_types_are_stored_fields(tmp_repo):
    write(tmp_repo, SWIFT_FILE, "public struct ReportReading: Codable {\n    public var kind: String\n"
                                "    public var segmentIds: [String]\n    public let method: [String: Int]?\n}\n")
    out = run(tmp_repo)
    assert out.returncode == 0, out.stdout
