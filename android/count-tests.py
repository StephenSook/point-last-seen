#!/usr/bin/env python3
"""Counts JUnit test cases in Gradle's XML reports so a CI log proves tests ran.

Usage: python3 -I android/count-tests.py <results dir> [--min N]
Prints "tests=<n> failures=<f> errors=<e> skipped=<s> files=<k>". Exit 1 when no
report or no test case is found, when the total is under --min, or when any test
failed, errored or was skipped; exit 0 otherwise. A zero-test pass is a failure.
"""
import pathlib
import sys
import xml.etree.ElementTree as ET


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: count-tests.py <results dir> [--min N]")
        return 1
    root = pathlib.Path(argv[0])
    minimum = int(argv[argv.index("--min") + 1]) if "--min" in argv else 1
    files = sorted(root.rglob("TEST-*.xml")) if root.is_dir() else []
    tests = failures = errors = skipped = 0
    for f in files:
        for case in ET.parse(f).getroot().iter("testcase"):
            tests += 1
            failures += len(case.findall("failure"))
            errors += len(case.findall("error"))
            skipped += len(case.findall("skipped"))
    print(f"tests={tests} failures={failures} errors={errors} skipped={skipped} files={len(files)}")
    if tests < max(minimum, 1):
        print(f"count-tests: FAIL, {tests} test cases found (need at least {max(minimum, 1)})")
        return 1
    if failures or errors or skipped:
        print("count-tests: FAIL, a test failed, errored or was skipped")
        return 1
    print("count-tests: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
