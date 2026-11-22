"""Tests of the answer-key kit (eval_key_kit.py). The rows here are test fixtures, not an answer key."""

import csv
import hashlib
import io
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import eval_key_kit as kit  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


@pytest.fixture(autouse=True)
def at_repo_root(monkeypatch):
    monkeypatch.chdir(REPO)


def sheet(*rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(kit.COLUMNS)
    for r in rows:
        w.writerow(r)
    return "# a comment line\n" + buf.getvalue()


def test_the_template_is_twenty_empty_rows_under_the_four_columns():
    text = kit.template_text()
    data = [line for line in text.splitlines() if not line.startswith("#")]
    assert data[0] == ",".join(kit.COLUMNS)
    assert data[1:] == [",,,"] * kit.ROWS
    header = "\n".join(line for line in text.splitlines() if line.startswith("#"))
    for value in kit.KINDS + kit.FEATURES:
        assert value in header
    assert "AA to AZ, BA to BZ, CA to CO" in header


def test_the_checked_in_template_is_what_the_kit_writes():
    with open(kit.TEMPLATE, encoding="utf-8") as f:
        assert f.read() == kit.template_text()


def test_a_filled_sheet_becomes_the_key_with_every_value_as_written():
    text = kit.key_from_sheet(sheet(["Fixture one, by the gate", "clue", "AB AC", "structure"],
                                    ["", "", "", ""],
                                    ["Fixture two", "unclear", "", "none"]))
    key = json.loads(text)
    assert key == {"answerKey": kit.KEY_NAME, "writtenBy": "person", "grid": kit.GRID_ID, "rows": [
        {"n": 1, "text": "Fixture one, by the gate", "kind": "clue", "segments": ["AB", "AC"], "feature": "structure"},
        {"n": 2, "text": "Fixture two", "kind": "unclear", "segments": [], "feature": "none"}]}
    # The same sheet always gives the same bytes, so the pinned SHA-256 names one key.
    assert kit.key_from_sheet(sheet(["Fixture one, by the gate", "clue", "AB AC", "structure"],
                                    ["Fixture two", "unclear", "", "none"])) == text
    assert text.endswith("}\n")


def test_the_key_names_who_wrote_it():
    text = kit.key_from_sheet(sheet(["Fixture", "clue", "AB", "none"]), written_by="A fixture writer, at a request")
    assert json.loads(text)["writtenBy"] == "A fixture writer, at a request"


@pytest.mark.parametrize("who", ["", "  ", " Fixture writer", "Fixture writer ", "Fixture\nwriter"])
def test_a_blank_padded_or_two_line_writer_is_refused(who):
    with pytest.raises(kit.SheetError, match="written-by"):
        kit.key_from_sheet(sheet(["Fixture", "clue", "AB", "none"]), written_by=who)


def test_convert_records_the_writer_it_is_given(tmp_path, monkeypatch):
    monkeypatch.setattr(kit, "KEY_FILE", str(tmp_path / "key.json"))
    filled = tmp_path / "sheet.csv"
    filled.write_text(sheet(["Fixture", "cleared", "BO", "trail"]), encoding="utf-8")
    assert kit.main(["convert", str(filled), "--written-by", "A fixture writer"]) == 0
    assert json.loads((tmp_path / "key.json").read_text(encoding="utf-8"))["writtenBy"] == "A fixture writer"


@pytest.mark.parametrize("row, why", [
    (["Fixture", "lost", "AB", "none"], "expected_kind"),
    (["Fixture", "clue", "AB AC AD", "none"], "at most"),
    (["Fixture", "clue", "ZZ", "none"], "not on the"),
    (["Fixture", "clue", "AB", "lake"], "place_feature"),
    (["", "clue", "AB", "none"], "report_text is empty"),
    ([" Fixture", "clue", "AB", "none"], "starts or ends with a space"),
    (["Fixture", "clue", "AB"], "cells"),
])
def test_a_wrong_value_is_refused_by_row(row, why):
    with pytest.raises(kit.SheetError, match=why):
        kit.key_from_sheet(sheet(row))


def test_an_empty_sheet_or_a_wrong_header_is_refused():
    with pytest.raises(kit.SheetError, match="no filled rows"):
        kit.key_from_sheet(sheet())
    with pytest.raises(kit.SheetError, match="header"):
        kit.key_from_sheet("text,kind\nFixture,clue\n")


def test_convert_never_replaces_a_key(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(kit, "KEY_FILE", str(tmp_path / "key.json"))
    filled = tmp_path / "sheet.csv"
    filled.write_text(sheet(["Fixture", "cleared", "BO", "trail"]), encoding="utf-8")
    assert kit.main(["convert", str(filled)]) == 0
    written = (tmp_path / "key.json").read_bytes()
    assert hashlib.sha256(written).hexdigest() in capsys.readouterr().out
    assert kit.main(["convert", str(filled)]) == 1
    assert (tmp_path / "key.json").read_bytes() == written


def test_the_picture_names_every_segment_inside_its_segment():
    svg = kit.picture_svg()
    segments = kit.grid_segments()
    for s in segments:
        assert f">{s['segmentId']}</text>" in svg
        x, y = kit.label_point(s["geometry"]["coordinates"], s["centroid"])
        assert kit.polygon_contains(s["geometry"]["coordinates"], x, y), s["segmentId"]
    assert "OpenStreetMap" in svg


# The key in the repo (pls-drill-reports-v1) and the sheet it was converted from, frozen before any model run.
SOURCE = os.path.join(kit.EVAL_DIR, kit.KEY_NAME + "-key.csv")
SOURCE_SHA256 = "da0926c0d4407a05728acd9d21e83573fa177a777e2abf1729fbf60cd4534732"
WRITER = "AI assistant (Claude Opus 5.5), at the builder's request"


def test_the_key_in_the_repo_is_its_frozen_sheet_converted_unedited():
    with open(SOURCE, "rb") as f:
        source = f.read()
    assert hashlib.sha256(source).hexdigest() == SOURCE_SHA256
    with open(kit.KEY_FILE, encoding="utf-8", newline="") as f:
        key = f.read()
    assert json.loads(key)["writtenBy"] == WRITER
    assert kit.key_from_sheet(source.decode("utf-8-sig"), WRITER) == key
