#!/usr/bin/env python3
"""The shape of an incident's segment docs, as the apps decode them.

The field sets come from shared/test-vectors/pack-segments-sample.json, which holds real segment docs that the
iPhone's own tests decode, so this check and the apps read the same contract: an ordinary segment's fields and ROW's.
On top of the field sets it checks the values the apps rely on: segmentId equal to the doc id; priorPoa and ringPoa
finite and not negative; one whole-number priorVersion across every doc, equal to the incident's; areaM2 above 0;
centroid lat and lon as numbers; geometryJson a STRING holding a GeoJSON Polygon or MultiPolygon; links and feature
classes as lists of strings; nearFrac between 0 and 1; a ROW doc; and, for a whole incident, a prior that sums to 1.

As a script it reads one incident from the live project and exits 0 when every doc passes, 1 when any does not
(each problem named) and 2 when it cannot read.

Usage: python3 -I tools/seed/segment_contract.py <project> <incidentId>
"""
import json
import math
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

VECTOR = Path(__file__).resolve().parents[2] / "shared/test-vectors/pack-segments-sample.json"


def plain(v: dict):
    """A Firestore REST value as plain JSON."""
    kind, x = next(iter(v.items()))
    if kind == "integerValue":
        return int(x)
    if kind == "mapValue":
        return {k: plain(f) for k, f in (x.get("fields") or {}).items()}
    if kind == "arrayValue":
        return [plain(i) for i in (x.get("values") or [])]
    if kind == "nullValue":
        return None
    return x


def plain_fields(fields: dict) -> dict:
    return {k: plain(v) for k, v in fields.items()}


def _field_sets() -> tuple[set[str], set[str]]:
    docs = json.loads(VECTOR.read_text())["segments"]
    row = next(set(d["fields"]) for d in docs if d["id"] == "ROW")
    seg = next(set(d["fields"]) for d in docs if d["id"] != "ROW")
    return seg, row


SEGMENT_FIELDS, ROW_FIELDS = _field_sets()


def _number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _strings(x) -> bool:
    return isinstance(x, list) and all(isinstance(i, str) for i in x)


def check(docs: dict[str, dict], incident_prior_version: int | None, complete: bool = True) -> list[str]:
    """Problems with an incident's segment docs ({doc id: plain fields}); empty when the apps can read them all."""
    out = []
    if "ROW" not in docs:
        out.append("ROW: missing")
    versions = set()
    for doc_id in sorted(docs):
        d = docs[doc_id]
        want = ROW_FIELDS if doc_id == "ROW" else SEGMENT_FIELDS
        if set(d) != want:
            missing, extra = sorted(want - set(d)), sorted(set(d) - want)
            out.append(f"{doc_id}: fields differ (missing {missing}, unexpected {extra})")
        if d.get("segmentId") != doc_id:
            out.append(f"{doc_id}: segmentId is {d.get('segmentId')!r}, not the doc id")
        if not _number(d.get("priorPoa")) or d["priorPoa"] < 0:
            out.append(f"{doc_id}: priorPoa is not a number at or above 0")
        v = d.get("priorVersion")
        if isinstance(v, int) and not isinstance(v, bool):
            versions.add(v)
        else:
            out.append(f"{doc_id}: priorVersion is not a whole number")
        if doc_id == "ROW":
            continue
        if not _number(d.get("ringPoa")) or d["ringPoa"] < 0:
            out.append(f"{doc_id}: ringPoa is not a number at or above 0")
        if not _number(d.get("areaM2")) or d["areaM2"] <= 0:
            out.append(f"{doc_id}: areaM2 is not a number above 0")
        c = d.get("centroid")
        if not isinstance(c, dict) or not _number(c.get("lat")) or not _number(c.get("lon")):
            out.append(f"{doc_id}: centroid needs numeric lat and lon")
        g = d.get("geometryJson")
        if not isinstance(g, str):
            out.append(f"{doc_id}: geometryJson is not a string")
        else:
            try:
                geom = json.loads(g)
            except ValueError:
                geom = None
            if not isinstance(geom, dict) or geom.get("type") not in ("Polygon", "MultiPolygon") or not geom.get("coordinates"):
                out.append(f"{doc_id}: geometryJson is not a GeoJSON Polygon or MultiPolygon")
        for k in ("neighbors", "upstream", "downstream", "featureClasses"):
            if not _strings(d.get(k)):
                out.append(f"{doc_id}: {k} is not a list of strings")
        if not _number(d.get("nearFrac")) or not 0 <= d["nearFrac"] <= 1:
            out.append(f"{doc_id}: nearFrac is not between 0 and 1")
    if len(versions) > 1:
        out.append(f"priorVersion differs across docs: {sorted(versions)}")
    if incident_prior_version is not None and versions and versions != {incident_prior_version}:
        out.append(f"priorVersion {sorted(versions)} is not the incident's {incident_prior_version}")
    if complete:
        total = sum(d["priorPoa"] for d in docs.values() if _number(d.get("priorPoa")))
        if not math.isclose(total, 1.0, abs_tol=1e-6):
            out.append(f"the prior does not sum to 1 ({total!r})")
    return out


def read_incident(project: str, incident_id: str) -> tuple[int | None, dict[str, dict]]:
    tok = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True)
    if tok.returncode != 0 or not tok.stdout.strip():
        raise OSError("no gcloud access token (run gcloud auth login)")
    headers = {"Authorization": f"Bearer {tok.stdout.strip()}", "x-goog-user-project": project}
    base = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/incidents/{incident_id}"

    def get(url: str) -> dict:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
            return json.loads(r.read())

    version = plain_fields(get(base).get("fields", {})).get("priorVersion")
    docs, page = {}, ""
    while True:
        r = get(f"{base}/segments?pageSize=300" + (f"&pageToken={page}" if page else ""))
        for d in r.get("documents", []):
            docs[d["name"].rsplit("/", 1)[1]] = plain_fields(d.get("fields", {}))
        page = r.get("nextPageToken", "")
        if not page:
            return (version if isinstance(version, int) else None), docs


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[-1])
        return 2
    try:
        version, docs = read_incident(*argv)
    except (OSError, urllib.error.URLError, ValueError) as e:
        print(f"segment_contract: cannot read {argv[1]}: {e}")
        return 2
    if not docs:
        print(f"segment_contract: {argv[1]} has no segment docs")
        return 1
    problems = check(docs, version)
    for p in problems[:40]:
        print(f"segment_contract: {argv[1]}: {p}")
    if problems:
        print(f"segment_contract: FAIL, {argv[1]}: {len(problems)} problem(s) in {len(docs)} docs")
        return 1
    print(f"segment_contract: ok, {argv[1]}: {len(docs)} docs at prior version {version}, readable by the apps")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
