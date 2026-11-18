#!/usr/bin/env python3
"""Create one synthetic training-drill incident in Firestore.

Writes incidents/{id} (mode "drill", labelled), its teams, and three admin-only
join code docs (joinCodes/{sha256(code)}), one per role: searcher, family and
command. A code admits only its own role. The codes are generated here, stored only
in the macOS Keychain (services pls-drill-searcher-code, pls-drill-family-code and
pls-drill-command-code, account = the incident id) and never printed. Creation is create-only: an existing incident or
code doc makes the write fail instead of overwriting it.

Uses the Firestore REST API with the gcloud user's OAuth token (IAM, so security
rules do not apply). Synthetic drill data only: no real person, place or case.

Usage: python3 -I tools/seed/seed_drill.py <project> <incidentId> "<name>" <teamId> [<teamId> ...]
"""

import hashlib
import json
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
ROOT = Path(__file__).resolve().parents[2]
DRILL_LABEL = "Training drill. Nobody is missing."
ROLES = ("searcher", "family", "command")
KEYCHAIN_SERVICES = {r: f"pls-drill-{r}-code" for r in ROLES}


def make_code() -> str:
    return "".join(secrets.choice(CROCKFORD) for _ in range(8))


def code_hash(code: str) -> str:
    normalized = "".join(code.upper().split()).replace("-", "")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def incident_doc(incident_id: str, name: str, params: dict) -> dict:
    engine = json.loads(json.dumps(params))
    return {
        "name": name, "mode": "drill", "drillLabel": DRILL_LABEL, "status": "open",
        "ipp": None, "ippSource": "typed", "plsTimeMs": None, "terrain": "temperate_flat",
        "priorVersion": 1, "priorModel": "rings", "priorSeed": 20261122, "priorInputEventIds": [],
        "engineParams": engine, "gridId": None,
    }


def join_code_docs(incident_id: str) -> dict[str, dict]:
    return {r: {"incidentId": incident_id, "roles": [r]} for r in ROLES}


def to_value(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [to_value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: to_value(x) for k, x in v.items()}}}
    raise TypeError(f"cannot encode {type(v).__name__}")


def _token() -> str:
    return subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()


def create_doc(project: str, path: str, data: dict, token: str, server_time_fields=("createdAt",)) -> None:
    """Create-only write with a server timestamp in each named field."""
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents:commit"
    name = f"projects/{project}/databases/(default)/documents/{path}"
    write = {"update": {"name": name, "fields": to_value(data)["mapValue"]["fields"]},
             "currentDocument": {"exists": False},
             "updateTransforms": [{"fieldPath": f, "setToServerValue": "REQUEST_TIME"} for f in server_time_fields]}
    req = urllib.request.Request(url, data=json.dumps({"writes": [write]}).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "x-goog-user-project": project})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"create {path} failed: HTTP {e.code} {e.read().decode()[:200]}") from None


def keychain_store(service: str, account: str, value: str) -> None:
    subprocess.run(["security", "add-generic-password", "-U", "-s", service, "-a", account, "-w", value],
                   capture_output=True, check=True)
    back = subprocess.run(["security", "find-generic-password", "-s", service, "-a", account, "-w"],
                          capture_output=True, text=True, check=True).stdout.strip()
    if back != value:
        raise SystemExit(f"Keychain read-back failed for {service}")


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print(__doc__)
        return 2
    project, incident_id, name, teams = argv[0], argv[1], argv[2], argv[3:]
    params = json.loads((ROOT / "shared/constants/engine-params.json").read_text())["params"]
    token = _token()
    codes = {r: make_code() for r in ROLES}
    docs = join_code_docs(incident_id)
    for r in ROLES:
        keychain_store(KEYCHAIN_SERVICES[r], incident_id, codes[r])
    create_doc(project, f"incidents/{incident_id}", incident_doc(incident_id, name, params), token)
    for i, team in enumerate(teams, start=1):
        create_doc(project, f"incidents/{incident_id}/teams/{team}", {"teamId": team, "name": f"Team {i}", "colorSlot": i}, token)
    for r in ROLES:
        create_doc(project, f"joinCodes/{code_hash(codes[r])}", docs[r], token)
    print(f"created drill incident {incident_id} with teams {', '.join(teams)}; one code per role stored in the "
          f"Keychain ({', '.join(KEYCHAIN_SERVICES.values())}, account {incident_id}); not printed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
