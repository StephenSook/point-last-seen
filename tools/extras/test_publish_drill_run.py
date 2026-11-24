"""Tests for tools/extras/publish_drill_run.py (a fake command runner; nothing is exported or written)."""

import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("publish_drill_run", Path(__file__).with_name("publish_drill_run.py"))
pdr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pdr)


@pytest.fixture(autouse=True)
def no_real_commands(monkeypatch):
    # main() runs the real exporter and overwrites the served run when its arguments pass. A test that reaches it by
    # mistake (as one did against the code before --kind) must fail here, not export a real incident.
    def refuse(step):
        raise AssertionError(f"a test reached the real command runner: {step.name}")

    monkeypatch.setattr(pdr, "shell_runner", refuse)


def test_label_and_run_id_name_the_drill_and_its_date_without_repeating_the_drill_line():
    assert pdr.label_for("field", "Kennesaw Mountain", "2026-11-22") == "REAL DRILL, Kennesaw Mountain, 2026-11-22"
    assert pdr.run_id_for("drill-kennesaw-1", "2026-11-22") == "drill-kennesaw-1-2026-11-22"
    for kind in pdr.KINDS:
        assert "Nobody is missing" not in pdr.label_for(kind, "Kennesaw Mountain", "2026-11-22")


def test_a_home_demo_is_labelled_as_one_and_never_as_a_real_drill():
    label = pdr.label_for("home-demo", "Kennesaw Mountain", "2026-11-23")
    assert label == "HOME DEMO, Kennesaw Mountain drill map, 2026-11-23"
    assert "REAL DRILL" not in label.upper()


def test_the_kinds_are_exactly_home_demo_and_field():
    assert pdr.KINDS == ("home-demo", "field")
    for kind in ("", "Field", "home", "real", "drill", None):
        with pytest.raises(ValueError):
            pdr.label_for(kind, "Kennesaw Mountain", "2026-11-22")


@pytest.mark.parametrize("place", ["Real Drill", "Kennesaw REAL DRILL site", "real  drill", "REAL\tDRILL"])
def test_a_label_saying_real_drill_is_refused_unless_the_kind_is_field(place):
    with pytest.raises(ValueError):
        pdr.plan("drill-kennesaw-1", "2026-11-23", place, "home-demo", Path("/tmp/x.json"))


@pytest.mark.parametrize("incident,date,place", [
    ("Drill Kennesaw", "2026-11-22", "Kennesaw Mountain"),   # not an incident id
    ("drill-kennesaw-1", "22/11/2026", "Kennesaw Mountain"),  # not an ISO date
    ("drill-kennesaw-1", "2026-11-22", ""),                   # no place
    ("drill-kennesaw-1", "2026-11-22", "Kennesaw\nMountain"),  # a line break in the label
])
def test_refuses_arguments_it_cannot_publish(incident, date, place):
    with pytest.raises(ValueError):
        pdr.plan(incident, date, place, "field", Path("/tmp/x.json"))


def test_the_plan_exports_then_replaces_the_served_run_then_repins_then_checks():
    steps = pdr.plan("drill-kennesaw-1", "2026-11-22", "Kennesaw Mountain", "field", Path("/tmp/run.json"))
    names = [s.name for s in steps]
    assert names == ["export", "replace", "pin", "check"]
    export = steps[0].argv
    assert export[:4] == ["npm", "run", "export", "-w"]
    assert "--incident" in export and export[export.index("--incident") + 1] == "drill-kennesaw-1"
    assert export[export.index("--label") + 1] == "REAL DRILL, Kennesaw Mountain, 2026-11-22"
    assert export[export.index("--run-id") + 1] == "drill-kennesaw-1-2026-11-22"
    assert export[export.index("--out") + 1] == "/tmp/run.json"
    assert steps[2].env == {"PLS_PIN_RUN": "write"}
    # Nothing here commits, pushes or deploys.
    flat = " ".join(" ".join(s.argv) for s in steps)
    for word in ("git", "deploy", "firebase"):
        assert word not in flat


def test_a_failed_export_stops_before_the_served_run_is_touched(tmp_path):
    served = tmp_path / "published-run.json"
    served.write_text('{"old": true}\n')
    calls = []

    def runner(step):
        calls.append(step.name)
        return 1 if step.name == "export" else 0

    code = pdr.run(pdr.plan("drill-kennesaw-1", "2026-11-22", "Kennesaw Mountain", "field", tmp_path / "run.json", served=served), runner)
    assert code == 1
    assert calls == ["export"]
    assert served.read_text() == '{"old": true}\n'


def test_a_successful_run_copies_the_export_over_the_served_run_and_runs_every_step(tmp_path):
    served = tmp_path / "published-run.json"
    served.write_text('{"old": true}\n')
    exported = tmp_path / "run.json"
    calls = []

    def runner(step):
        calls.append(step.name)
        if step.name == "export":
            exported.write_text('{"new": true}\n')
        return 0

    assert pdr.run(pdr.plan("drill-kennesaw-1", "2026-11-22", "Kennesaw Mountain", "field", exported, served=served), runner) == 0
    assert calls == ["export", "replace", "pin", "check"]
    assert served.read_text() == '{"new": true}\n'


def test_a_home_demo_plan_exports_under_the_home_demo_label():
    steps = pdr.plan("drill-kennesaw-1", "2026-11-23", "Kennesaw Mountain", "home-demo", Path("/tmp/run.json"))
    export = steps[0].argv
    assert export[export.index("--label") + 1] == "HOME DEMO, Kennesaw Mountain drill map, 2026-11-23"


def test_the_command_line_has_no_default_kind(capsys):
    with pytest.raises(SystemExit) as e:
        pdr.main(["--incident", "drill-kennesaw-1", "--date", "2026-11-23", "--place", "Kennesaw Mountain"])
    assert e.value.code == 2
    assert "--kind" in capsys.readouterr().err


def test_the_command_line_refuses_a_real_drill_place_for_a_home_demo_before_running_anything(monkeypatch, capsys):
    ran = []
    monkeypatch.setattr(pdr, "shell_runner", lambda step: ran.append(step.name) or 0)
    code = pdr.main(["--incident", "drill-kennesaw-1", "--date", "2026-11-23", "--place", "Real Drill", "--kind", "home-demo"])
    assert code == 2
    assert ran == []
    assert "REAL DRILL" in capsys.readouterr().err
