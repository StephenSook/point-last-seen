"""Writes a grid's segment docs and prior to an incident (admin tool, gcloud user's OAuth token).

Input is the JSON that `build-grid --prior` writes: { gridId, ipp, terrain, layers, travelBearingDeg,
attribution, docs }. Every doc is set under incidents/{id}/segments/{segmentId} (ROW last), segment docs
the new grid no longer has are deleted, and only the named incident fields change (gridId, ipp, terrain,
priorLayers, gridAttribution, priorVersion). The incident update is the last write, so the incident never
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

COMMIT_MAX = 500
ID = re.compile(r"^[A-Z]{2}$")
SEGMENT_KEYS = {"segmentId", "priorPoa", "geometryJson", "centroid", "areaM2", "neighbors", "upstream", "downstream",
                "nearFrac", "featureClasses"}


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


def build_writes(project: str, incident_id: str, p: dict, existing_ids: set[str], prior_version: int) -> list[dict]:
    base = f"projects/{project}/databases/(default)/documents/incidents/{incident_id}"
    writes = [{"update": {"name": f"{base}/segments/{d['segmentId']}", "fields": to_value(d)["mapValue"]["fields"]}}
              for d in p["docs"]]
    new_ids = {d["segmentId"] for d in p["docs"]}
    writes += [{"delete": f"{base}/segments/{s}"} for s in sorted(existing_ids - new_ids)]
    inc = {"gridId": p["gridId"], "ipp": {"lat": float(p["ipp"]["lat"]), "lon": float(p["ipp"]["lon"])},
           "terrain": p["terrain"], "priorLayers": p["layers"], "gridAttribution": p["attribution"],
           "priorVersion": int(prior_version)}
    writes.append({"update": {"name": base, "fields": to_value(inc)["mapValue"]["fields"]},
                   "updateMask": {"fieldPaths": sorted(inc)}, "currentDocument": {"exists": True}})
    return writes


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


def main(argv: list[str]) -> int:
    if len(argv) != 5 or argv[3] != "--prior-version":
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    project, incident_id, path, _, version = argv
    p = json.load(open(path))
    validate(p)
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
    existing = segment_ids(project, incident_id, token)
    writes = build_writes(project, incident_id, p, existing, int(version))
    commit = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents:commit"
    for b in batches(writes):
        _request("POST", commit, token, project, {"writes": b})
    after = segment_ids(project, incident_id, token)
    want = {d["segmentId"] for d in p["docs"]}
    print(f"seed_segments: {len(want) - 1} segments plus ROW set, {len(existing - want)} stale deleted; read back {len(after)} docs")
    return 0 if after == want else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
