"""Tests for tools/rules/gen_rules_validators.py (schemas compiled into Firestore rules functions)."""

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
spec = importlib.util.spec_from_file_location("gen", HERE / "gen_rules_validators.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


def expr(schema, ref="m.k"):
    return gen.value_check(schema, ref, {})


def test_scalars_carry_every_bound():
    assert expr({"type": "string", "maxLength": 40}) == "(m.k is string && m.k.size() <= 40)"
    # A pattern with no unbounded repeat already bounds the length (rules match the whole string).
    # matches() errors (so the rule denies) on anything but a string, so a patterned string needs no "is string".
    assert expr({"type": "string", "pattern": "^[0-9]{2}$"}) == "(m.k.matches('^[0-9]{2}$'))"
    with pytest.raises(ValueError, match="unbounded string"):
        expr({"type": "string", "pattern": "^[a-z]+$"})
    assert expr({"type": "integer", "minimum": 0, "maximum": 11}) == "(m.k is int && m.k >= 0 && m.k <= 11)"
    assert expr({"type": "number"}) == "(m.k is number)"
    assert expr({"type": "boolean"}) == "(m.k is bool)"
    assert expr({"enum": ["a", "b"]}) == "(m.k in ['a', 'b'])"


def test_an_integer_enum_in_even_steps_compiles_to_a_range_and_a_step():
    # Same set of values, fewer rules expressions than a list literal (0, 45, ..., 315 is 8 values).
    assert expr({"enum": [0, 45, 90, 135, 180, 225, 270, 315]}) == "(m.k is int && m.k >= 0 && m.k <= 315 && m.k % 45 == 0)"
    assert expr({"enum": [10, 20, 40]}) == "(m.k in [10, 20, 40])"
    assert expr({"enum": [2, 5, 8, 11]}) == "(m.k is int && m.k >= 2 && m.k <= 11 && (m.k - 2) % 3 == 0)"


def test_nullable_forms():
    assert expr({"type": ["number", "null"]}) == "(m.k == null || (m.k is number))"
    assert expr({"anyOf": [{"enum": ["x"]}, {"type": "null"}]}) == "(m.k == null || (m.k in ['x']))"


def test_arrays_are_bounded_and_items_checked():
    a = expr({"type": "array", "items": {"type": "string", "maxLength": 16}, "maxItems": 2})
    assert a == ("(m.k is list && m.k.size() <= 2 && (m.k.size() < 1 || (m.k[0] is string && m.k[0].size() <= 16))"
                 " && (m.k.size() < 2 || (m.k[1] is string && m.k[1].size() <= 16)))")
    assert expr({"type": "array", "items": {"enum": ["cane", "walker"]}}) == "(m.k is list && m.k.size() <= 2 && m.k.hasOnly(['cane', 'walker']))"


def test_shape_mode_keeps_every_value_constraint_and_only_drops_key_lists():
    # Codex MP2 review (M3 and generator drift): shape mode saves rules expressions only on key-list literals;
    # enums, numeric ranges and per-item checks stay exactly as the schema says.
    assert gen.value_check({"enum": ["n", "ne", "upstream"]}, "m.k", {}, shape=True) == "(m.k.matches('(?s)^.{0,8}$'))"
    # A bounded string in shape mode is one regex for type and length: matches() errors on a non-string, and an
    # error denies; (?s) counts a newline as a character. Cheaper than "is string" plus a size comparison.
    assert gen.value_check({"type": "string", "maxLength": 40}, "m.k", {}, shape=True) == "(m.k.matches('(?s)^.{0,40}$'))"
    assert gen.value_check({"type": "string", "minLength": 2, "maxLength": 9}, "m.k", {}, shape=True) == "(m.k.matches('(?s)^.{2,9}$'))"
    assert gen.value_check({"enum": ["cleared", "clue"]}, "m.kind", {}, shape=True) == "(m.kind in ['cleared', 'clue'])"
    assert gen.value_check({"type": "integer", "minimum": 1}, "m.k", {}, shape=True) == "(m.k is int)"
    assert gen.value_check({"type": "number", "minimum": 0}, "m.latencyMs", {}, shape=True) == "(m.latencyMs is number && m.latencyMs >= 0)"
    # A symmetric range (latitude) in one comparison that also refuses NaN and infinity.
    assert gen.value_check({"type": "number", "minimum": -90, "maximum": 90}, "m.lat", {}, shape=True) == "(m.lat is number && m.lat * m.lat <= 8100)"
    box = {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 1000}, "minItems": 2, "maxItems": 2}
    assert gen.value_check(box, "m.b", {}, shape=True) == ("(m.b is list && m.b.size() == 2 && (m.b[0] is int && m.b[0] >= 0 && m.b[0] <= 1000)"
                                                         " && (m.b[1] is int && m.b[1] >= 0 && m.b[1] <= 1000))")
    # Short string lists, shape mode: each item by index, padded with valid placeholders so no size guard is
    # needed, one regex per item for type and length (matches() errors on a non-string, which denies); (?s) lets
    # an item hold a newline. No join, so a comma inside an item is just a character (review round 3).
    carried = {"type": "array", "items": {"type": "string", "maxLength": 40}, "maxItems": 3}
    pad = "m.c.concat(['', '', ''])"
    assert gen.value_check(carried, "m.c", {}, shape=True) == ("(m.c is list && m.c.size() <= 3"
        f" && {pad}[0].matches('(?s)^.{{0,40}}$') && {pad}[1].matches('(?s)^.{{0,40}}$') && {pad}[2].matches('(?s)^.{{0,40}}$'))")
    ids = {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 16}, "maxItems": 3}
    assert gen.value_check(ids, "m.k", {}, shape=True).count("m.k.concat(['x', 'x', 'x'])[2].matches('(?s)^.{1,16}$')") == 1
    # All keys required, shape mode: size() == n plus a check that reads every named key pins the key set
    # (a missing key is an error, and an error denies), with no list literal.
    obj = {"type": "object", "additionalProperties": False, "required": ["a", "b"], "properties": {"a": {"type": "boolean"}, "b": {"type": "boolean"}}}
    assert gen.object_check(obj, "m", {}, shape=True) == "(m is map && m.size() == 2 && (m.a is bool) && (m.b is bool))"


def test_unbounded_strings_and_lists_are_refused():
    with pytest.raises(ValueError, match="unbounded string"):
        expr({"type": "string"})
    with pytest.raises(ValueError, match="unbounded list"):
        expr({"type": "array", "items": {"type": "string", "maxLength": 4}})


def test_objects_need_exact_keys_and_partial_mode_checks_only_present_keys():
    obj = {"type": "object", "additionalProperties": False, "required": ["a"], "properties": {"a": {"type": "boolean"}}}
    # All keys required: hasOnly plus a size check is one list literal instead of two (the 1,000-expression limit).
    assert gen.object_check(obj, "m", {}) == "(m is map && m.keys().hasOnly(['a']) && m.size() == 1 && (m.a is bool))"
    assert gen.object_check(obj, "m", {}, partial=True) == "(m is map && m.keys().hasOnly(['a']) && (!('a' in m) || (m.a is bool)))"


def test_generated_block_is_current_in_firestore_rules():
    out = subprocess.run([sys.executable, "-I", str(HERE / "gen_rules_validators.py"), "--check"], capture_output=True, text=True, cwd=REPO)
    assert out.returncode == 0, out.stdout + out.stderr


def test_the_block_defines_every_validator_from_the_schemas():
    block = gen.render(REPO)
    for name in ("schema_Position", "schema_ReportReading", "schema_RouteRecord", "schema_CameraSighting", "schema_SharedProfile"):
        assert f"function {name}(m)" in block
    assert "'lewy_body'" in block and "matches('^[0-9]{2}:[0-5][0-9]$')" in block
    assert "m.reason.matches('(?s)^.{0," in block and "m.latencyMs >= 0" in block and "m.kind in ['cleared'" in block
    assert "approachNoteIds.hasOnly(['may_not_respond', 'approach_calm'" in block
