"""Publishes remoteconfig.template.json to the project's Remote Config, but only after reading the live template.

A publish replaces the whole live template, so a file missing a key (or holding a different value) would
silently clear an operator's change, for example a kill_cloud pause. This script:
  1. reads the live template and its ETag (Remote Config REST API, gcloud's access token, never printed);
  2. lists every parameter the file adds, changes or removes;
  3. refuses when any live value would change or disappear, unless that key is named with --allow KEY;
  4. with --publish only: validates the template server-side, then publishes it with If-Match on the ETag, so
     a template changed by someone else in between is refused rather than overwritten.
Without --publish it is a dry run. firebase.json names no template, so `firebase deploy` cannot publish it.

Usage: python3 -I scripts/rc_publish.py [--allow KEY ...] [--publish]
"""
import gzip
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "buildhybridai-2026-yg3m"
URL = f"https://firebaseremoteconfig.googleapis.com/v1/projects/{PROJECT}/remoteConfig"


def plan(live: dict, file: dict, allow: set[str]) -> dict:
    """What publishing `file` over `live` does to each parameter, and which changes need --allow."""
    added = sorted(k for k in file if k not in live)
    changed = sorted(k for k in file if k in live and live[k] != file[k])
    removed = sorted(k for k in live if k not in file)
    refused = sorted(k for k in changed + removed if k not in allow)
    return {"added": added, "changed": changed, "removed": removed, "refused": refused}


def _token() -> str:
    out = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip():
        raise SystemExit("rc_publish: no gcloud access token (run gcloud auth login); nothing published")
    return out.stdout.strip()


def _request(method: str, url: str, token: str, body: bytes | None = None, etag: str | None = None):
    # The API returns the ETag only when the request accepts gzip.
    headers = {"Authorization": f"Bearer {token}", "x-goog-user-project": PROJECT, "Accept-Encoding": "gzip"}
    if body is not None:
        headers["Content-Type"] = "application/json; charset=UTF-8"
    if etag:
        headers["If-Match"] = etag
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw or b"{}"), r.headers.get("ETag")


def _describe(p: dict) -> str:
    extra = " (+ conditional values)" if p.get("conditionalValues") else ""
    return json.dumps(p.get("defaultValue", {}).get("value")) + extra


def main(argv: list[str]) -> int:
    allow = {argv[i + 1] for i, a in enumerate(argv) if a == "--allow" and i + 1 < len(argv)}
    publish = "--publish" in argv
    template = json.loads((ROOT / "remoteconfig.template.json").read_text())
    file_params = template["parameters"]
    token = _token()
    try:
        live, etag = _request("GET", URL, token)
    except urllib.error.HTTPError as e:
        print(f"rc_publish: reading the live template gave HTTP {e.code}; nothing published", file=sys.stderr)
        return 1
    if not etag:
        print("rc_publish: the live template came back without an ETag; nothing published", file=sys.stderr)
        return 1
    live_params = live.get("parameters", {})
    if live.get("conditions") or live.get("parameterGroups"):
        print("rc_publish: the live template has conditions or groups this file does not carry; nothing published",
              file=sys.stderr)
        return 1
    p = plan(live_params, file_params, allow)
    print(f"rc_publish: live version {live.get('version', {}).get('versionNumber', 'none')}, "
          f"{len(live_params)} live parameters, {len(file_params)} in the file")
    for k in p["added"]:
        print(f"  add     {k} = {_describe(file_params[k])}")
    for k in p["changed"]:
        print(f"  change  {k}: {_describe(live_params[k])} -> {_describe(file_params[k])}")
    for k in p["removed"]:
        print(f"  remove  {k} (live {_describe(live_params[k])})")
    if p["refused"]:
        print(f"rc_publish: REFUSED, a live value would change or disappear: {', '.join(p['refused'])}. "
              "Name each with --allow KEY if that is intended.", file=sys.stderr)
        return 1
    if not publish:
        print("rc_publish: dry run; add --publish to publish")
        return 0
    body = json.dumps({"parameters": file_params}).encode()
    try:
        _request("PUT", URL + "?validateOnly=true", token, body, etag)
        result, new_etag = _request("PUT", URL, token, body, etag)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        print(f"rc_publish: publish refused with HTTP {e.code}: {detail}", file=sys.stderr)
        return 1
    print(f"rc_publish: published version {result.get('version', {}).get('versionNumber')} (ETag changed: {new_etag != etag})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
