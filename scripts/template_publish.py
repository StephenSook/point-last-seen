"""Publishes the server prompt templates in shared/templates to Firebase AI Logic.

Each shared/templates/<id>.json holds one template's parts (model, config, input and output schema, system
instruction, user prompt). It is rendered to a Dotprompt string with JSON frontmatter (JSON is valid YAML), so the
repository is the source of truth and the console is not. Without --publish this is a dry run: it reads the live
templates and prints what it would create or update. With --publish it validates each change, writes it, and reads
it back. A locked live template is refused, never unlocked here.

Usage: python3 -I scripts/template_publish.py [--publish]
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "buildhybridai-2026-yg3m"
BASE = f"https://firebasevertexai.googleapis.com/v1beta/projects/{PROJECT}/locations/global/templates"


def templates(root: Path) -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted((root / "shared/templates").glob("*.json"))]


def render(t: dict) -> str:
    """The Dotprompt string: frontmatter (model, config, input, output) as JSON, then the system and user turns."""
    front = {"model": t["model"], "config": t.get("config", {}), "input": t["input"], "output": t["output"]}
    return ("---\n" + json.dumps(front, indent=2) + "\n---\n"
            + '{{role "system"}}\n' + t["system"] + "\n\n"
            + '{{role "user"}}\n' + t["user"] + "\n")


def live_templates(listing: dict) -> dict[str, dict]:
    """The list endpoint's answer, keyed by template id (the API returns them under "templates")."""
    return {t["name"].rsplit("/", 1)[1]: t for t in listing.get("templates", [])}


def plan(local: dict[str, str], remote: dict[str, dict]) -> dict[str, list[str]]:
    """local: id -> rendered string; remote: id -> live PromptTemplate."""
    out = {"create": [], "update": [], "same": [], "locked": []}
    for tid in sorted(local):
        live = remote.get(tid)
        if live is None:
            out["create"].append(tid)
        elif live.get("templateString") == local[tid]:
            out["same"].append(tid)
        elif live.get("locked"):
            out["locked"].append(tid)
        else:
            out["update"].append(tid)
    return out


def _request(method: str, url: str, token: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": f"Bearer {token}", "x-goog-user-project": PROJECT,
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


def main(argv: list[str]) -> int:
    publish = "--publish" in argv
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True).stdout.strip()
    if not token:
        print("template_publish: no gcloud access token; nothing published", file=sys.stderr)
        return 1
    local_t = {t["templateId"]: t for t in templates(ROOT)}
    local = {tid: render(t) for tid, t in local_t.items()}
    remote = live_templates(_request("GET", BASE, token))
    p = plan(local, remote)
    for kind in ("create", "update", "same", "locked"):
        for tid in p[kind]:
            print(f"  {kind:7} {tid}")
    if p["locked"]:
        print("template_publish: REFUSED, a locked live template differs from the repository; unlock it on purpose first",
              file=sys.stderr)
        return 1
    if not publish:
        print("template_publish: dry run; add --publish to publish")
        return 0
    for tid in p["create"] + p["update"]:
        body = {"displayName": local_t[tid].get("displayName", tid), "templateString": local[tid]}
        url = f"{BASE}/{tid}?allowMissing=true"
        try:
            _request("PATCH", url + "&validateOnly=true", token, body)
            _request("PATCH", url, token, body)
        except urllib.error.HTTPError as e:
            print(f"template_publish: {tid} refused with HTTP {e.code}: {e.read().decode(errors='replace')[:400]}", file=sys.stderr)
            return 1
        back = _request("GET", f"{BASE}/{tid}", token)
        same = back.get("templateString") == local[tid]
        print(f"template_publish: {tid} published, model {back.get('model')}, read back equal: {same}")
        if not same:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
