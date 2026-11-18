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
    assert expr({"type": "string", "pattern": "^[0-9]{2}$"}) == "(m.k is string && m.k.matches('^[0-9]{2}$'))"
    with pytest.raises(ValueError, match="unbounded string"):
        expr({"type": "string", "pattern": "^[a-z]+$"})
    assert expr({"type": "integer", "minimum": 0, "maximum": 11}) == "(m.k is int && m.k >= 0 && m.k <= 11)"
    assert expr({"type": "number"}) == "(m.k is number)"
    assert expr({"type": "boolean"}) == "(m.k is bool)"
    assert expr({"enum": ["a", "b"]}) == "(m.k in ['a', 'b'])"


def test_nullable_forms():
    assert expr({"type": ["number", "null"]}) == "(m.k == null || (m.k is number))"
    assert expr({"anyOf": [{"enum": ["x"]}, {"type": "null"}]}) == "(m.k == null || (m.k in ['x']))"


def test_arrays_are_bounded_and_items_checked():
    a = expr({"type": "array", "items": {"type": "string", "maxLength": 16}, "maxItems": 2})
    assert a == ("(m.k is list && m.k.size() <= 2 && (m.k.size() < 1 || (m.k[0] is string && m.k[0].size() <= 16))"
                 " && (m.k.size() < 2 || (m.k[1] is string && m.k[1].size() <= 16)))")
    assert expr({"type": "array", "items": {"enum": ["cane", "walker"]}}) == "(m.k is list && m.k.size() <= 2 && m.k.hasOnly(['cane', 'walker']))"


def test_shape_mode_bounds_string_enums_by_length_instead_of_listing_them():
    # Inside event-carried shapes the risk is size; clients and engines enforce the enums.
    assert gen.value_check({"enum": ["n", "ne", "upstream"]}, "m.k", {}, shape=True) == "(m.k is string && m.k.size() <= 8)"
    assert gen.value_check({"enum": [0, 45, 90]}, "m.k", {}, shape=True) == "(m.k in [0, 45, 90])"
    assert gen.value_check({"type": "array", "items": {"enum": ["a", "bb"]}}, "m.k", {}, shape=True) == "(m.k is list && m.k.size() <= 2 && m.k.hasOnly(['a', 'bb']))"
    # Short string lists: the joined length bounds the whole list (join fails, so the rule denies, on a non-string).
    assert gen.value_check({"type": "array", "items": {"type": "string", "maxLength": 16}, "maxItems": 3}, "m.k", {}, shape=True) \
        == "(m.k is list && m.k.size() <= 3 && m.k.join('').size() <= 48)"
    # All keys required, shape mode: size() == n plus a check that reads every named key pins the key set
    # (a missing key is an error, and an error denies), with no list literal.
    obj = {"type": "object", "additionalProperties": False, "required": ["a", "b"], "properties": {"a": {"type": "boolean"}, "b": {"type": "boolean"}}}
    assert gen.object_check(obj, "m", {}, shape=True) == "(m is map && m.size() == 2 && (m.a is bool) && (m.b is bool))"
    # A number cannot grow, so shape mode keeps only its type.
    assert gen.value_check({"type": "integer", "minimum": 1}, "m.k", {}, shape=True) == "(m.k is int)"


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
    assert "m.reason.size() <= " in block and "'possible_evidence'" not in block
    assert "approachNoteIds.hasOnly(['may_not_respond', 'approach_calm'" in block
