"""firebase.json may only route to functions we deploy (fact-sheet audit: /pack/** pointed at a missing function)."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def exported_functions(index_ts: str) -> set[str]:
    return set(re.findall(r"^export const (\w+)\s*=", index_ts, re.MULTILINE))


def hosting_sites() -> list[dict]:
    hosting = json.loads((ROOT / "firebase.json").read_text())["hosting"]
    return hosting if isinstance(hosting, list) else [hosting]


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


def test_the_app_shell_rewrite_never_answers_for_tiles_or_evidence():
    # A missing /tiles/ or /evidence/ file must be a real 404, not the app shell served as a map or a run.
    for site in hosting_sites():
        shell = [r for r in site.get("rewrites", []) if r.get("destination") == "/index.html"]
        assert [r.get("source") for r in shell] == ["!/@(tiles|evidence)/**"], shell


# Firebase Hosting serves every file with max-age=3600 when firebase.json sets no header, so a judge could keep
# the old app for an hour after a deploy. Pages, version.json and the service worker must be revalidated every
# time; Vite's hashed assets never change under one name, so they can be kept for a year.
NO_CACHE = "no-cache"
IMMUTABLE = "public, max-age=31536000, immutable"


def glob_regex(pattern: str) -> re.Pattern[str]:
    """Hosting's glob for the shapes used here: ** (any path), * (one segment), @(a|b) (one of)."""
    out = ""
    i = 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif pattern[i] == "*":
            out += "[^/]*"
            i += 1
        elif pattern.startswith("@(", i):
            end = pattern.index(")", i)
            out += "(?:" + "|".join(re.escape(p) for p in pattern[i + 2 : end].split("|")) + ")"
            i = end + 1
        else:
            out += re.escape(pattern[i])
            i += 1
    return re.compile(out + r"\Z")


def matches(source: str, path: str) -> bool:
    if source.startswith("!"):
        return not glob_regex(source[1:]).match(path)
    return bool(glob_regex(source).match(path))


def cache_control(site: dict, path: str) -> list[str]:
    """Every Cache-Control value the site's header rules give the path (one, when the rules do not overlap)."""
    return [h["value"] for rule in site.get("headers", []) if matches(rule["source"], path) for h in rule["headers"] if h["key"].lower() == "cache-control"]


def test_the_glob_reading_matches_hostings_on_known_paths():
    assert matches("!/@(tiles|evidence)/**", "/judge") and not matches("!/@(tiles|evidence)/**", "/tiles/piedmont.pmtiles")
    assert matches("/assets/**", "/assets/index-klvD0fVz.js") and not matches("/assets/**", "/version.json")


def test_pages_version_and_service_worker_are_revalidated_and_hashed_assets_are_kept_a_year():
    for site in hosting_sites():
        for path in ["/", "/index.html", "/judge", "/version.json", "/sw.js", "/sw-takeover.js", "/manifest.webmanifest", "/evidence/published-run.json"]:
            assert cache_control(site, path) == [NO_CACHE], path
        for path in ["/assets/index-klvD0fVz.js", "/assets/index-Bq1x2y3z.css"]:
            assert cache_control(site, path) == [IMMUTABLE], path
        # Basemap tiles are large range reads under one name per grid; they keep Hosting's hour.
        assert cache_control(site, "/tiles/piedmont-park-dev.pmtiles") == ["public, max-age=3600"]
