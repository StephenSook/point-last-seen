"""Judging runs 2026-12-10 to 2026-12-16: time-based values that could change behaviour inside the
window are pinned here so a change fails before submit, never after the deadline."""

import json
import re
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
JUDGING_ENDS = date(2026, 12, 16)
PROJECT_CREATED = date(2026, 11, 17)  # the earliest any media or clip reading can exist


def test_the_media_lifecycle_cannot_delete_anything_before_judging_ends():
    rule = json.loads((REPO / "storage.lifecycle.json").read_text())["rule"][0]
    assert rule["action"]["type"] == "Delete"
    assert PROJECT_CREATED + timedelta(days=rule["condition"]["age"]) > JUDGING_ENDS


def test_clip_readings_ttl_is_declared_and_the_rules_allow_at_least_30_days():
    over = json.loads((REPO / "firestore.indexes.json").read_text()).get("fieldOverrides", [])
    assert {"collectionGroup": "clipReadings", "fieldPath": "expiresAt", "ttl": True, "indexes": []} in over
    rules = (REPO / "firestore.rules").read_text()
    days = int(re.search(r"d\.expiresAt <= request\.time \+ duration\.value\((\d+), 'd'\)", rules).group(1))
    assert days >= 30


def test_the_daily_probes_retire_only_after_judging():
    for script in ("scripts/appcheck_control.py", "scripts/media_probe.py", "scripts/models_probe.py", "scripts/served_version_check.py",
                   "scripts/judge_quota_probe.py"):
        m = re.search(r"RETIRE_AFTER = date\((\d+), (\d+), (\d+)\)", (REPO / script).read_text())
        assert date(*map(int, m.groups())) > JUDGING_ENDS, script


def test_the_daily_probe_runs_every_probe_script():
    wf = (REPO / ".github/workflows/probe.yml").read_text()
    for script in ("scripts/appcheck_control.py --no-token-only", "scripts/media_probe.py", "scripts/models_probe.py",
                   "scripts/appcheck_control.py --ci", "scripts/judge_quota_probe.py"):
        assert f"python3 -I {script}" in wf, script
