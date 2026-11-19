"""firebase.json may only route to functions we deploy (fact-sheet audit: /pack/** pointed at a missing function)."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def exported_functions(index_ts: str) -> set[str]:
    return set(re.findall(r"^export const (\w+)\s*=", index_ts, re.MULTILINE))


def test_every_hosting_rewrite_to_a_function_names_an_exported_function():
    hosting = json.loads((ROOT / "firebase.json").read_text())["hosting"]
    sites = hosting if isinstance(hosting, list) else [hosting]
    exported = exported_functions((ROOT / "functions/src/index.ts").read_text())
    assert "cloudGuard" in exported and "startJudgeSession" in exported
    for site in sites:
        for rewrite in site.get("rewrites", []):
            fn = rewrite.get("function")
            if fn is not None:
                name = fn if isinstance(fn, str) else fn.get("functionId")
                assert name in exported, f"{rewrite['source']} routes to {name}, which functions/src/index.ts does not export"
