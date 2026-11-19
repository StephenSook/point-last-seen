"""Writes a grid's segment docs and prior to an incident (admin tool, gcloud user's OAuth token).

Input is the JSON that `build-grid --prior` writes: { gridId, ipp, terrain, layers, travelBearingDeg,
attribution, docs }. Every doc is set under incidents/{id}/segments/{segmentId} (ROW last), segment docs
the new grid no longer has are deleted, and only the named incident fields change (gridId, ipp, terrain,
priorLayers, gridAttribution, priorVersion, engineParams.rings.<terrain> from the constants, so an incident
created before its terrain existed can build that prior, and priorBuiltAt at the server's time). The incident update is the last write, so the incident never
points at a grid whose segments are not there yet. Then it reads the segments back and checks the count.

Usage: python3 -I tools/seed/seed_segments.py <project> <incidentId> <segments.json> --prior-version N
"""
import json
import math
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENGINE_PARAMS = Path(__file__).resolve().parents[2] / "shared/constants/engine-params.json"

COMMIT_MAX = 500
ID = re.compile(r"^[A-Z]{2}$")
# What the grid builder writes for a segment; the seed adds priorVersion to every segment and to ROW, so a seeded
# segment has the same fields as one the command post's rebuild writes (shared/test-vectors/pack-segments-sample.json).
SEGMENT_KEYS = {"segmentId", "priorPoa", "ringPoa", "geometryJson", "centroid", "areaM2", "neighbors", "upstream",
                "downstream", "nearFrac", "featureClasses"}


def validate(p: dict) -> None:
    docs = p["docs"]
    if not docs or docs[-1].get("segmentId") != "ROW" or any(d.get("segmentId") == "ROW" for d in docs[:-1]):
        raise ValueError("ROW must be the last doc, once")
    ids = [d["segmentId"] for d in docs[:-1]]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate segment id")
    for d in docs[:-1]:
        if not ID.match(d["segmentId"]):
            raise ValueError(f"segment id {d['segmentId']!r} is not two capital letters")
        if set(d) != SEGMENT_KEYS:
            raise ValueError(f"segment {d['segmentId']} keys differ: {sorted(set(d) ^ SEGMENT_KEYS)}")
        g = json.loads(d["geometryJson"])
        if g.get("type") != "Polygon" or not g.get("coordinates"):
            raise ValueError(f"segment {d['segmentId']} geometry is not a Polygon")
    if any(not isinstance(d["priorPoa"], (int, float)) or d["priorPoa"] < 0 for d in docs):
        raise ValueError("negative or non-numeric priorPoa")
    if any(not isinstance(d["ringPoa"], (int, float)) or not math.isfinite(d["ringPoa"]) or d["ringPoa"] < 0 for d in docs[:-1]):
        raise ValueError("negative or non-numeric ringPoa")
    total = sum(d["priorPoa"] for d in docs)
    if not math.isclose(total, 1.0, abs_tol=1e-9):
        raise ValueError(f"prior must sum to 1, got {total!r}")


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


def build_writes(project: str, incident_id: str, p: dict, existing_ids: set[str], prior_version: int,
                 stored_rings: list | None = None, *, incident_update_time: str) -> list[dict]:
    """stored_rings: the incident's own engineParams.rings[<terrain>], or None when it has none.
    incident_update_time: the incident's updateTime from the same read, so the commit lands only on that version."""
    base = f"projects/{project}/databases/(default)/documents/incidents/{incident_id}"
    writes = [{"update": {"name": f"{base}/segments/{d['segmentId']}",
                          "fields": to_value({**d, "priorVersion": int(prior_version)})["mapValue"]["fields"]}}
              for d in p["docs"]]
    new_ids = {d["segmentId"] for d in p["docs"]}
    writes += [{"delete": f"{base}/segments/{s}"} for s in sorted(existing_ids - new_ids)]
    inc = {"gridId": p["gridId"], "ipp": {"lat": float(p["ipp"]["lat"]), "lon": float(p["ipp"]["lon"])},
           "terrain": p["terrain"], "priorLayers": p["layers"], "gridAttribution": p["attribution"],
           "priorVersion": int(prior_version)}
    # The prior was built from the sourced ring column for this terrain. An incident that has none gets it (by field
    # path, so every other stored engine value stays); one that holds the same radii is left alone; one whose own
    # radii differ would show a prior built from other radii, so the seed is refused.
    terrain = p["terrain"]
    column = [float(r) for r in json.loads(ENGINE_PARAMS.read_text())["params"]["rings"][terrain]]
    fields = to_value(inc)["mapValue"]["fields"]
    mask = sorted(inc)
    if stored_rings is None:
        fields["engineParams"] = to_value({"rings": {terrain: column}})
        mask.append(f"engineParams.rings.{terrain}")
    elif [float(r) for r in stored_rings] != column:
        raise ValueError(f"incident {incident_id} overrides the {terrain} rings ({stored_rings}); this prior was built from "
                         f"the sourced {column}, so it is not seeded")
    # First, and only onto the version that was read: if the incident changed since, the first commit fails and no
    # segment is written.
    writes.insert(0, {"update": {"name": base, "fields": fields},
                      "updateMask": {"fieldPaths": mask},
                      "updateTransforms": [{"fieldPath": "priorBuiltAt", "setToServerValue": "REQUEST_TIME"}],
                      "currentDocument": {"updateTime": incident_update_time}})
    return writes


def _contract():
    """tools/seed/segment_contract.py, loaded by path (python3 -I leaves this folder off sys.path)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("segment_contract", Path(__file__).with_name("segment_contract.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prewrite_problems(p: dict, prior_version: int) -> list[str]:
    """The docs as they will be stored, checked against the shape the apps decode, before anything is written."""
    docs = {d["segmentId"]: {**d, "priorVersion": int(prior_version)} for d in p["docs"]}
    return _contract().check(docs, int(prior_version))


def batches(writes: list[dict]) -> list[list[dict]]:
    return [writes[i:i + COMMIT_MAX] for i in range(0, len(writes), COMMIT_MAX)]


def _request(method: str, url: str, token: str, project: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "x-goog-user-project": project})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {url.split('/documents')[-1]} failed: HTTP {e.code} {e.read().decode()[:300]}") from None


def segment_ids(project: str, incident_id: str, token: str) -> set[str]:
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/incidents/{incident_id}/segments"
    ids, page = set(), ""
    while True:
        r = _request("GET", f"{url}?pageSize=1000&mask.fieldPaths=segmentId{'&pageToken=' + page if page else ''}", token, project)
        ids |= {d["name"].rsplit("/", 1)[1] for d in r.get("documents", [])}
        page = r.get("nextPageToken", "")
        if not page:
            return ids


def read_incident(project: str, incident_id: str, token: str, terrain: str) -> tuple[list | None, str]:
    """The incident's own engineParams.rings[terrain] as numbers (None when it holds no such column), and the
    updateTime of the version read, which the commit is bound to."""
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/incidents/{incident_id}"
    doc = _request("GET", url, token, project)
    f = doc.get("fields", {})
    col = (f.get("engineParams", {}).get("mapValue", {}).get("fields", {}).get("rings", {}).get("mapValue", {})
           .get("fields", {}).get(terrain))
    rings = None if col is None else [float(v.get("doubleValue", v.get("integerValue", "nan")))
                                      for v in col.get("arrayValue", {}).get("values", [])]
    return rings, doc["updateTime"]


def main(argv: list[str]) -> int:
    if len(argv) != 5 or argv[3] != "--prior-version":
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    project, incident_id, path, _, version = argv
    p = json.load(open(path))
    validate(p)
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
    existing = segment_ids(project, incident_id, token)
    stored, update_time = read_incident(project, incident_id, token, p["terrain"])
    problems = prewrite_problems(p, int(version))
    if problems:
        print(f"seed_segments: REFUSED, the apps could not read these docs: {problems[:5]}", file=sys.stderr)
        return 1
    try:
        writes = build_writes(project, incident_id, p, existing, int(version), stored, incident_update_time=update_time)
    except ValueError as e:
        print(f"seed_segments: REFUSED: {e}", file=sys.stderr)
        return 1
    commit = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents:commit"
    for b in batches(writes):
        _request("POST", commit, token, project, {"writes": b})
    after = segment_ids(project, incident_id, token)
    want = {d["segmentId"] for d in p["docs"]}
    print(f"seed_segments: {len(want) - 1} segments plus ROW set, {len(existing - want)} stale deleted; read back {len(after)} docs")
    # The read-back must pass the apps' contract too, against the incident's stored prior version.
    contract = _contract()
    stored_version, stored_docs = contract.read_incident(project, incident_id)
    problems = contract.check(stored_docs, stored_version)
    for line in problems[:10]:
        print(f"seed_segments: READ BACK {line}", file=sys.stderr)
    return 0 if after == want and not problems else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
