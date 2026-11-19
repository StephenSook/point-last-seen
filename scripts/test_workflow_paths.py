"""A workflow's path filter must cover every repository file its tests read, or a change there skips the job."""

import fnmatch
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# A repository path the functions code or tests name, as a relative path from their folder or from the root.
REFERENCE = re.compile(r"(?:\.\./)*((?:shared/(?:constants|schemas|templates|grid|test-vectors)/[A-Za-z0-9_.*/-]+)"
                       r"|storage\.lifecycle\.json|firestore\.rules|storage\.rules|remoteconfig\.template\.json)")


def referenced_files(folder: str) -> set[str]:
    found: set[str] = set()
    for path in (ROOT / folder).rglob("*.ts"):
        if "node_modules" in path.parts or "lib" in path.parts:
            continue
        for match in REFERENCE.findall(path.read_text()):
            target = match.rstrip("/.")
            if (ROOT / target).is_dir():
                target += "/x.json"
            found.add(target)
    return found


def trigger_paths(workflow: str) -> dict[str, list[str]]:
    """The `paths:` list under each trigger (push, pull_request), read without a YAML library."""
    out: dict[str, list[str]] = {}
    trigger = None
    in_paths = False
    for line in (ROOT / ".github/workflows" / workflow).read_text().splitlines():
        if re.match(r"^  (push|pull_request):", line):
            trigger, in_paths = line.strip().rstrip(":"), False
        elif re.match(r"^\S", line) or re.match(r"^  \S", line):
            trigger, in_paths = None, False
        elif trigger and line.strip() == "paths:":
            in_paths = True
            out[trigger] = []
        elif trigger and in_paths and line.strip().startswith("- "):
            out[trigger].append(line.strip()[2:].strip().strip('"').strip("'"))
        elif in_paths and line.strip():
            in_paths = False
    return out


def test_rules_workflow_runs_for_every_file_the_functions_tests_read():
    files = referenced_files("functions/src") | referenced_files("functions/test")
    assert "shared/constants/models.json" in files and "storage.lifecycle.json" in files, sorted(files)
    patterns = trigger_paths("rules.yml")["push"]
    missing = sorted(f for f in files if not any(fnmatch.fnmatch(f, p) for p in patterns))
    assert missing == [], f"rules.yml does not run when these change: {missing}"


def test_rules_workflow_push_and_pull_request_filters_match():
    paths = trigger_paths("rules.yml")
    assert len(paths["push"]) >= 7 and paths["push"] == paths["pull_request"], paths
