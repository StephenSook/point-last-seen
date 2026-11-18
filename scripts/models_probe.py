"""Daily, credential-free check that every model we name still exists on Firebase AI Logic: reads the live models
page (https://firebase.google.com/docs/ai-logic/models) and exits 1 if any model named by remoteconfig.template.json
or shared/constants/models.json is missing, is in the Shutdown stage, or has a shutdown date on or before the end
of judging. A model can be withdrawn earlier than its documented date, so this page check is paired with a full
signed call run on the Mac (scripts/appcheck_control.py). Retires itself after 2026-12-17.

Usage: python3 -I scripts/models_probe.py
"""
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

PAGE = "https://firebase.google.com/docs/ai-logic/models"
JUDGING_ENDS = date(2026, 12, 17)
RETIRE_AFTER = date(2026, 12, 17)
FLOOR = 10  # the page listed 24 model records on 2026-11-18
DATE = r"[A-Z][a-z]+ \d{1,2}, \d{4}"
RECORD = re.compile(rf"(gemini-[a-z0-9.\-]+) Release date: (?:{DATE}|---) Release stage: ([A-Za-z][A-Za-z ]*?) "
                    rf"Shutdown date: ({DATE}|---)")


def parse_records(html: str) -> dict[str, tuple[str, date | None]]:
    """Model id to (release stage, shutdown date or None), from the page's records. A later record for the same
    id (the page lists some models twice) replaces an earlier one only if it is stricter."""
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html).replace("&nbsp;", " "))
    out: dict[str, tuple[str, date | None]] = {}
    for mid, stage, shut in RECORD.findall(text):
        when = None if shut == "---" else datetime.strptime(shut, "%B %d, %Y").date()
        prev = out.get(mid)
        if prev is None or (when is not None and (prev[1] is None or when < prev[1])):
            out[mid] = (stage.strip(), when)
    return out


def evaluate(records: dict, ids: list[str], today: date, floor: int = FLOOR) -> list[str]:
    if len(records) < floor:
        return [f"the models page gave {len(records)} model records (expected at least {floor}); its format may have changed"]
    problems = []
    for mid in ids:
        if mid not in records:
            problems.append(f"{mid} is not on the models page")
            continue
        stage, when = records[mid]
        if stage.lower().startswith("shutdown"):
            problems.append(f"{mid} is in release stage {stage}")
        if when is not None and when <= JUDGING_ENDS:
            problems.append(f"{mid} shuts down on {when.isoformat()}, before judging ends ({JUDGING_ENDS.isoformat()})")
    return problems


def ids_to_check(root: Path) -> list[str]:
    """Every model id a client can use: Remote Config's model keys and the allow-list the rules gate enforces."""
    rc = json.loads((root / "remoteconfig.template.json").read_text())["parameters"]
    ids = {p["defaultValue"]["value"] for k, p in rc.items() if "model" in k and p["defaultValue"]["value"]}
    ids |= {m["id"] for m in json.loads((root / "shared/constants/models.json").read_text())["models"]}
    return sorted(ids)


def retired(today: date) -> bool:
    return today > RETIRE_AFTER


def main() -> int:
    today = datetime.now(timezone.utc).date()
    if retired(today):
        print(f"models_probe: retired after {RETIRE_AFTER} (judging over); nothing checked")
        return 0
    req = urllib.request.Request(PAGE, headers={"User-Agent": "Mozilla/5.0 (models_probe)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        records = parse_records(r.read().decode())
    ids = ids_to_check(Path(__file__).resolve().parents[1])
    problems = evaluate(records, ids, today)
    for p in problems:
        print(f"models_probe: FAIL: {p}")
    if not problems:
        print(f"models_probe: ok, {len(ids)} models listed with no shutdown before {JUDGING_ENDS} ({len(records)} records read)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
