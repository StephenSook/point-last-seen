"""The probe's check that the live site serves main's newest web change (scripts/served_version_check.py)."""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("sv", Path(__file__).with_name("served_version_check.py"))
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)


def git(ancestors: set[tuple[str, str]], newest: str):
    """A fake git: `newest` is main's newest web-affecting commit; (a, b) in ancestors means a is an ancestor of b."""
    def run(args: list[str]) -> tuple[int, str]:
        if args[:2] == ["log", "-1"]:
            return 0, newest + "\n"
        if args[:2] == ["merge-base", "--is-ancestor"]:
            a, b = args[2], args[3]
            return (0 if a == b or (a, b) in ancestors else 1), ""
        if args[:2] == ["rev-list", "--count"]:
            return 0, "3\n"
        raise AssertionError(args)
    return run


def test_passes_when_the_site_serves_the_newest_web_commit_or_later():
    assert sv.check({"commit": "w1", "dirty": False}, git(set(), "w1")) == []
    assert sv.check({"commit": "m9", "dirty": False}, git({("w1", "m9"), ("m9", "HEAD")}, "w1")) == []


def test_fails_when_main_has_web_changes_the_site_does_not_serve():
    problems = sv.check({"commit": "old", "dirty": False}, git({("old", "HEAD")}, "w1"))
    assert len(problems) == 1 and "w1" in problems[0] and "old" in problems[0]


def test_fails_on_a_dirty_build_or_a_missing_commit():
    assert any("dirty" in p for p in sv.check({"commit": "w1", "dirty": True}, git(set(), "w1")))
    assert any("no commit" in p for p in sv.check({"dirty": False}, git(set(), "w1")))


def test_watches_every_path_the_hosted_site_is_built_from():
    assert {"web", "shared", "firebase.json", "package.json", "package-lock.json"} <= set(sv.WEB_PATHS)
