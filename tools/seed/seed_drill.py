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
       python3 -I tools/seed/seed_drill.py --rotate <project> <incidentId> <role>

--rotate replaces one role's code: the new code is kept in the Keychain (account <incidentId>.next) before
anything changes, then one atomic commit creates the new joinCodes doc (only if absent) and deletes the old one
(only if present), then the new code becomes the role's Keychain entry. No code is printed.
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


def make_codes() -> dict[str, str]:
    """One code per role, all distinct (drawn again until they are), before anything is stored."""
    while True:
        codes = {r: make_code() for r in ROLES}
        if len(set(codes.values())) == len(ROLES):
            return codes


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


def make_rotated_code(current: set[str]) -> str:
    """A fresh code that differs from every code the incident uses now."""
    while True:
        code = make_code()
        if code not in current:
            return code


def rotation_writes(project: str, incident_id: str, role: str, old_code: str, new_code: str) -> list[dict]:
    """One commit: create the new code's doc if absent, delete the old one if present."""
    base = f"projects/{project}/databases/(default)/documents/joinCodes"
    doc = {"incidentId": incident_id, "roles": [role]}
    return [
        {"update": {"name": f"{base}/{code_hash(new_code)}", "fields": to_value(doc)["mapValue"]["fields"]},
         "currentDocument": {"exists": False},
         "updateTransforms": [{"fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"}]},
        {"delete": f"{base}/{code_hash(old_code)}", "currentDocument": {"exists": True}},
    ]


def keychain_read(service: str, account: str) -> str:
    return subprocess.run(["security", "find-generic-password", "-s", service, "-a", account, "-w"],
                          capture_output=True, text=True, check=True).stdout.strip()


def rotate(project: str, incident_id: str, role: str) -> int:
    if role not in ROLES:
        raise SystemExit(f"role must be one of {', '.join(ROLES)}")
    current = {r: keychain_read(KEYCHAIN_SERVICES[r], incident_id) for r in ROLES}
    new_code = make_rotated_code(set(current.values()))
    service = KEYCHAIN_SERVICES[role]
    keychain_store(service, f"{incident_id}.next", new_code)
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents:commit"
    body = {"writes": rotation_writes(project, incident_id, role, current[role], new_code)}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json",
                                          "x-goog-user-project": project})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"rotation commit failed: HTTP {e.code} {e.read().decode()[:200]}; the old code still "
                         f"works and the new one is unused in the Keychain ({service}, {incident_id}.next)") from None
    keychain_store(service, incident_id, new_code)
    subprocess.run(["security", "delete-generic-password", "-s", service, "-a", f"{incident_id}.next"],
                   capture_output=True, check=True)
    print(f"rotated the {role} code of {incident_id}; the new code is in the Keychain ({service}, account "
          f"{incident_id}); not printed")
    return 0


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
    if argv[:1] == ["--rotate"]:
        if len(argv) != 4:
            print(__doc__)
            return 2
        return rotate(argv[1], argv[2], argv[3])
    if len(argv) < 4:
        print(__doc__)
        return 2
    project, incident_id, name, teams = argv[0], argv[1], argv[2], argv[3:]
    params = json.loads((ROOT / "shared/constants/engine-params.json").read_text())["params"]
    token = _token()
    codes = make_codes()
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
