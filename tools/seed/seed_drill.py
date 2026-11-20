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

       python3 -I tools/seed/seed_drill.py --add-code <project> <incidentId> <role> <incidentId>-<name> [--expires <UTC time>]
       python3 -I tools/seed/seed_drill.py --revoke-code <project> <incidentId> <role> <incidentId>-<name>

--rotate replaces one role's code: the new code is kept in the Keychain (account <incidentId>.next) before
anything changes, then one atomic commit creates the new joinCodes doc (only if absent) and deletes the old one
(only if present), then the new code becomes the role's Keychain entry. No code is printed.

--add-code makes an extra code for one role (for example an app reviewer's) that can be revoked on its own: it is
kept in the Keychain under the role's service and its own account, <incidentId>-<name>, then its joinCodes doc is
created (only if absent). --revoke-code checks that the code's doc names this incident and role, deletes it (only
if present) and removes the Keychain entry. Neither ever touches the primary code (account = the incident id).
--expires (a future UTC time such as 2026-12-17T23:59:59Z) gives the extra code an expiresAt, after which joinIncident
refuses it; revoke it anyway once it is no longer needed.
"""

import hashlib
import json
import re
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
        "ipp": None, "ippSource": "typed", "plsTimeMs": None, "terrain": "urban",
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


EXTRA_ACCOUNT = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def extra_account_ok(incident_id: str, account: str) -> bool:
    """An extra code's Keychain account: the incident id, "-" and a lower-case name; never the primary account."""
    prefix = f"{incident_id}-"
    return account.startswith(prefix) and EXTRA_ACCOUNT.fullmatch(account[len(prefix):]) is not None


def add_code_write(project: str, incident_id: str, role: str, code: str, expires: str | None = None) -> dict:
    """Create the code's doc, only if no doc has that hash; with an expiry, joinIncident refuses it after that time."""
    base = f"projects/{project}/databases/(default)/documents/joinCodes"
    fields = to_value({"incidentId": incident_id, "roles": [role]})["mapValue"]["fields"]
    if expires is not None:
        fields["expiresAt"] = {"timestampValue": expires}
    return {"update": {"name": f"{base}/{code_hash(code)}", "fields": fields},
            "currentDocument": {"exists": False},
            "updateTransforms": [{"fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"}]}


def check_expires(expires: str) -> str:
    """A UTC time written YYYY-MM-DDTHH:MM:SSZ, in the future."""
    import datetime
    bad = "--expires must be a UTC time like 2026-12-17T23:59:59Z (the value given is not repeated here)"
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", expires):
        raise SystemExit(bad)
    try:
        when = datetime.datetime.fromisoformat(expires.replace("Z", "+00:00"))
    except ValueError:
        raise SystemExit(bad) from None
    if when <= datetime.datetime.now(datetime.timezone.utc):
        raise SystemExit("--expires must be a time in the future")
    return expires


def revoke_code_write(project: str, code: str) -> dict:
    """Delete the code's doc, only if it is there."""
    return {"delete": f"projects/{project}/databases/(default)/documents/joinCodes/{code_hash(code)}",
            "currentDocument": {"exists": True}}


def _check_extra(incident_id: str, role: str, account: str) -> None:
    if role not in ROLES:
        raise SystemExit(f"role must be one of {', '.join(ROLES)}")
    if not extra_account_ok(incident_id, account):
        raise SystemExit(f"account must be {incident_id}-<name> (lower-case letters, digits and -), never the primary "
                         f"account {incident_id}")


def _commit(project: str, writes: list[dict]) -> None:
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents:commit"
    req = urllib.request.Request(url, data=json.dumps({"writes": writes}).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json",
                                          "x-goog-user-project": project})
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()


def add_code(project: str, incident_id: str, role: str, account: str, expires: str | None = None) -> int:
    _check_extra(incident_id, role, account)
    service = KEYCHAIN_SERVICES[role]
    code = make_rotated_code({keychain_read(KEYCHAIN_SERVICES[r], incident_id) for r in ROLES})
    keychain_store(service, account, code)
    try:
        _commit(project, [add_code_write(project, incident_id, role, code, expires)])
    except urllib.error.HTTPError as e:
        subprocess.run(["security", "delete-generic-password", "-s", service, "-a", account], capture_output=True)
        raise SystemExit(f"creating the code failed: HTTP {e.code} {e.read().decode()[:200]}; nothing was kept") from None
    print(f"added a {role} code for {incident_id}; it is in the Keychain ({service}, account {account}); not printed")
    return 0


def revoke_code(project: str, incident_id: str, role: str, account: str) -> int:
    _check_extra(incident_id, role, account)
    service = KEYCHAIN_SERVICES[role]
    code = keychain_read(service, account)
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/joinCodes/{code_hash(code)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {_token()}", "x-goog-user-project": project})
    with urllib.request.urlopen(req, timeout=30) as r:
        fields = json.loads(r.read()).get("fields", {})
    roles = [v.get("stringValue") for v in fields.get("roles", {}).get("arrayValue", {}).get("values", [])]
    if fields.get("incidentId", {}).get("stringValue") != incident_id or roles != [role]:
        raise SystemExit(f"the code under {account} is not a {role} code of {incident_id}; nothing was changed")
    _commit(project, [revoke_code_write(project, code)])
    subprocess.run(["security", "delete-generic-password", "-s", service, "-a", account], capture_output=True, check=True)
    print(f"revoked the {role} code under {account} for {incident_id}; its doc and Keychain entry are gone")
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
    # The value goes to `security -i` on stdin, never in arguments, which every local process can read.
    if not re.fullmatch(r"[0-9A-Za-z_.-]{1,128}", value + service + account):
        raise SystemExit("keychain_store: unexpected characters in a Keychain value or name")
    subprocess.run(["security", "-i"], input=f'add-generic-password -U -s "{service}" -a "{account}" -w "{value}"\n',
                   capture_output=True, text=True, check=True)
    back = subprocess.run(["security", "find-generic-password", "-s", service, "-a", account, "-w"],
                          capture_output=True, text=True, check=True).stdout.strip()
    if back != value:
        raise SystemExit(f"Keychain read-back failed for {service}")


MAX_TEAMS = 8  # a plan holds at most 8 assignments (firestore.rules validAssignments), one a team
TEAM_ID = re.compile(r"[A-Za-z0-9_]{1,32}")


def check_teams(teams: list[str]) -> list[str]:
    """1 to 8 distinct team ids, each one a push can reach (no "-", the topic separator), never "family"."""
    if not 1 <= len(teams) <= MAX_TEAMS:
        raise SystemExit(f"a drill needs 1 to {MAX_TEAMS} teams; got {len(teams)}")
    if len(set(teams)) != len(teams):
        raise SystemExit("team ids must differ")
    for t in teams:
        if not TEAM_ID.fullmatch(t) or t.lower() == "family":
            raise SystemExit(f"team id {t!r} must be 1 to 32 letters, digits or _, and not family")
    return teams


def main(argv: list[str]) -> int:
    if argv[:1] in (["--add-code"], ["--revoke-code"]):
        expires = None
        if argv[0] == "--add-code" and len(argv) >= 6 and argv[5] == "--expires":
            if len(argv) != 7:
                print(__doc__)
                return 2
            expires = check_expires(argv[6])
            argv = argv[:5]
        if len(argv) != 5:
            print(__doc__)
            return 2
        _check_extra(argv[2], argv[3], argv[4])
        if argv[0] == "--add-code":
            return add_code(argv[1], argv[2], argv[3], argv[4], expires)
        return revoke_code(argv[1], argv[2], argv[3], argv[4])
    if argv[:1] == ["--rotate"]:
        if len(argv) != 4:
            print(__doc__)
            return 2
        return rotate(argv[1], argv[2], argv[3])
    if len(argv) < 4:
        print(__doc__)
        return 2
    project, incident_id, name, teams = argv[0], argv[1], argv[2], check_teams(argv[3:])
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
