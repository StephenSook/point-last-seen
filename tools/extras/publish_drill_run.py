"""Publish a finished drill's run to the judge page, in one command, from the repository root.

    python3 -I tools/extras/publish_drill_run.py --incident drill-kennesaw-1 --date 2026-11-23 \
        --place "Kennesaw Mountain" --kind home-demo

--kind has no default: "field" is a drill run outdoors at the place, labelled "REAL DRILL, <place>, <date>"; "home-demo"
is a run of the same incident done away from the place, labelled "HOME DEMO, <place> drill map, <date>". Any other
label that says "real drill" is refused, so a run done at home cannot be published as a field drill.

It exports the incident with the run exporter (tools/export-run, which refuses any run that breaks the public run's
rules and writes nothing then), under that label, copies it over
web/public/evidence/published-run.json, re-pins the judge replay's expectations from it, and runs that check. It
reads the incident (the exporter uses the signed-in gcloud user); it never writes to it, and it never commits,
pushes or deploys. Compare the printed end code with the live command post before committing anything.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[2]
SERVED = ROOT / "web" / "public" / "evidence" / "published-run.json"
EXPECT = ROOT / "web" / "src" / "extras" / "replay" / "publishedRun.expect.json"
PIN_TEST = "extras/replay/publishedRun"

KINDS = ("home-demo", "field")
REAL_DRILL = re.compile(r"real\s+drill", re.IGNORECASE)
INCIDENT_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass
class Step:
    name: str
    argv: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    copy: tuple[Path, Path] | None = None


def label_for(kind: str, place: str, date: str) -> str:
    """The run's own label. It says what kind of run it was, the place and the date; the replay already shows the drill
    line. Only a field drill may say "real drill"."""
    if kind == "field":
        return f"REAL DRILL, {place}, {date}"
    if kind == "home-demo":
        label = f"HOME DEMO, {place} drill map, {date}"
        if REAL_DRILL.search(label):
            raise ValueError(f"a home demo's label may not say REAL DRILL: {label!r}")
        return label
    raise ValueError(f"the kind must be one of {', '.join(KINDS)}, not {kind!r}")


def run_id_for(incident: str, date: str) -> str:
    return f"{incident}-{date}"


def plan(incident: str, date: str, place: str, kind: str, out: Path, served: Path = SERVED) -> list[Step]:
    """The steps, in order. Refuses arguments that would make a wrong or unsafe label or id."""
    if not INCIDENT_ID.match(incident):
        raise ValueError(f"not an incident id: {incident!r}")
    if not ISO_DATE.match(date):
        raise ValueError(f"not a YYYY-MM-DD date: {date!r}")
    place = place.strip()
    if not place or "\n" in place or "\r" in place or len(place) > 80:
        raise ValueError("the place must be one short line of text")
    label = label_for(kind, place, date)
    export = [
        "npm", "run", "export", "-w", "tools/export-run", "--",
        "--incident", incident, "--out", str(out),
        "--run-id", run_id_for(incident, date), "--label", label,
    ]
    return [
        Step("export", export),
        Step("replace", copy=(out, served)),
        Step("pin", ["npm", "test", "-w", "web", "--", PIN_TEST], {"PLS_PIN_RUN": "write"}),
        Step("check", ["npm", "test", "-w", "web", "--", PIN_TEST]),
    ]


def run(steps: list[Step], runner: Callable[[Step], int]) -> int:
    """Runs each step in order and stops at the first that fails, so the served run is never replaced by a refused one."""
    for step in steps:
        if step.copy is not None:
            code = runner(step)
            if code == 0:
                shutil.copyfile(step.copy[0], step.copy[1])
        else:
            code = runner(step)
        if code != 0:
            print(f"publish_drill_run: {step.name} failed (exit {code}); stopped.", file=sys.stderr)
            return code
    return 0


def shell_runner(step: Step) -> int:
    if step.copy is not None:
        return 0 if step.copy[0].is_file() else 1
    print(f"publish_drill_run: {step.name}: {' '.join(step.argv)}")
    return subprocess.run(step.argv, cwd=ROOT, env={**os.environ, **step.env}, check=False).returncode


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--incident", required=True)
    p.add_argument("--date", required=True, help="the drill's date, YYYY-MM-DD")
    p.add_argument("--place", required=True, help='for the label, e.g. "Kennesaw Mountain"')
    p.add_argument("--kind", required=True, choices=KINDS,
                   help='"field" for a drill run outdoors at the place, "home-demo" for a run of it done elsewhere')
    args = p.parse_args(argv)
    with tempfile.TemporaryDirectory() as tmp:
        try:
            steps = plan(args.incident, args.date, args.place, args.kind, Path(tmp) / "published-run.json")
        except ValueError as e:
            print(f"publish_drill_run: {e}", file=sys.stderr)
            return 2
        code = run(steps, shell_runner)
    if code == 0:
        print(f"publish_drill_run: the judge replay now serves {args.incident}. Expectations: {EXPECT.relative_to(ROOT)}")
        print(EXPECT.read_text())
        print("Before committing: check that endCode above matches the live command post's match code for the incident.")
        print("Nothing was committed, pushed or deployed.")
    return code


if __name__ == "__main__":
    sys.exit(main())
