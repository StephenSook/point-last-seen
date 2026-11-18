#!/usr/bin/env python3
"""Reference implementation and generator for shared/test-vectors/search.json.

Standard library only. This is the third implementation of the search engine
(spec sections 8, 9 and 10.1 to 10.4), written independently of the TypeScript
engine and the Swift twin. Both engines must reproduce every `expected` value:
number leaves within 1e-12 relative; strings, booleans, null, array order and
object key sets exactly.

Usage:
  python3 -I tools/vectors/make_vectors.py          write search.json
  python3 -I tools/vectors/make_vectors.py --check  exit 1 if search.json is stale

Conventions every engine follows (the vectors pin them):
- Track length is speed x (minutes x 60) x searchers, in that order.
- Coverage is (W x L) / A. POD is 1 - exp(-C).
- Events are applied in ascending eventId order; a repeated eventId is skipped.
- A clue multiplies every prior entry (ROW included) by its IOC; entries the
  effect does not list are "neutral". A vector-only `iocOverride` map replaces
  the table for the listed entries and leaves unlisted entries unchanged.
- The posterior total is summed in prior order. A zero total gives poa 0.
"""

import hashlib
import json
import math
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARAMS = json.loads((ROOT / "shared/constants/engine-params.json").read_text())["params"]
TERMS = json.loads((ROOT / "shared/constants/evidence-terms.json").read_text())["terms"]
OUT = ROOT / "shared/test-vectors/search.json"

SECTIONS = ["pod", "trackLength", "ioc", "posterior", "orderIndependence", "deriveEffect",
            "docToEngine", "rank", "ids", "router", "evidence"]
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
COMPASS = {"n": 0, "ne": 45, "e": 90, "se": 135, "s": 180, "sw": 225, "w": 270, "nw": 315}
AUTHENTICITY = {"consistent": "high", "unknown": "medium", "inconsistent": "low"}
POINTED_AT_MAX_DEG = 45
POD_CONSISTENCY_TOLERANCE = 1e-9


# ---------------------------------------------------------------- search math

def sweep_width(rd, p):
    return p["sweepWidthFactor"] * rd


def track_length(minutes, searchers, search_type, p):
    speed = p["hastySpeedMps"] if search_type == "hasty" else p["sweepSpeedMps"]
    return speed * (minutes * p["secondsPerMinute"]) * searchers


def coverage(w, length, area):
    return (w * length) / area


def pod(c):
    return 1 - math.exp(-c)


def ioc(influence, authenticity, p):
    return 1 - p["authenticityWeight"][authenticity] * (1 - p["iocBase"][influence])


def normalize_coverage(v, p):
    if v is None:
        return None
    if not math.isfinite(v):
        return "invalid"
    if 0 <= v <= p["coverageRatioMax"]:
        return v
    if p["coverageRatioMax"] < v <= p["coveragePercentMax"]:
        return v / 100
    return "invalid"


def none(why):
    return {"kind": "none", "why": why}


def first_known(ids, segments):
    return next((s for s in ids if s in segments), None)


def derive_cleared(reading, ctx, p):
    """Order of checks: kind, sound-only, segment, coverage, missing inputs."""
    if reading["kind"] != "cleared":
        return none("invalid")
    if reading["method"] == "sound" and not p["detectionProfile"]["soundCounts"]:
        return none("sound_only")
    segments = ctx["segments"]
    seg = first_known(reading["segmentIds"], segments) or first_known(ctx["assignedSegmentIds"], segments)
    if seg is None:
        return none("needs_command")
    area = segments[seg]["areaM2"]
    cov = normalize_coverage(reading["coverage"], p)
    if cov == "invalid":
        return none("invalid")
    rd_basis = ctx["rdBasis"]
    if cov is not None:
        c, w, length = cov, None, None
    else:
        # Spec 10.4: the team's measured visual range wins; a stated (model-read) range is used only
        # when there is no measurement, so it can never raise POD above a hidden-target measurement.
        rd = ctx["visualDetectionRangeM"]
        if rd is None:
            rd = reading["detectionRangeM"]
            if rd is not None:
                rd_basis = "stated"
        if reading["minutes"] is None or reading["searchers"] is None or rd is None:
            return none("needs_command")
        w = sweep_width(rd, p)
        length = track_length(reading["minutes"], reading["searchers"], reading["searchType"], p)
        c = coverage(w, length, area)
    return {"kind": "cleared", "segmentId": seg, "pod": pod(c),
            "inputs": {"coverage": c, "sweepWidthM": w, "trackLengthM": length,
                       "areaM2": area, "rdBasis": rd_basis}}


def angle_between(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def derive_clue(reading, ctx):
    """Clue or sighting reading. Position decides the segment when present."""
    if reading["kind"] not in ("clue", "sighting"):
        return none("invalid")
    segments = ctx["segments"]
    if ctx["position"] is not None:
        target = ctx["positionSegmentId"]
        if target is None or target not in segments:
            return none("outside_area")
    else:
        target = first_known(reading["segmentIds"], segments) or first_known(ctx["assignedSegmentIds"], segments)
        if target is None:
            return none("needs_command")
    influences = {target: "strong_for"}
    info = segments[target]
    direction = reading["direction"]
    pointed = []
    if direction in COMPASS:
        pointed = [n["segmentId"] for n in info["neighbors"]
                   if angle_between(n["bearingDeg"], COMPASS[direction]) <= POINTED_AT_MAX_DEG]
    elif direction in ("upstream", "downstream"):
        pointed = info[direction]
    for s in pointed:
        if s in segments and s != target:
            influences[s] = "for"
    return {"kind": "clue", "influences": influences,
            "authenticity": AUTHENTICITY[reading["matchesProfile"]]}


INFLUENCES = ("strong_for", "for", "neutral", "against", "strong_against")
RD_BASES = ("hidden_target", "open_target", "default", "stated")
NONE_REASONS = ("needs_command", "informational", "invalid", "sound_only", "outside_area", "incorporated_in_prior")


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def well_formed_effect(eff):
    """The same shape the security rules enforce. A malformed stored effect is skipped, never fatal."""
    if not isinstance(eff, dict):
        return False
    kind = eff.get("kind")
    if kind == "cleared":
        i = eff.get("inputs")
        return (set(eff) == {"kind", "segmentId", "pod", "inputs"} and isinstance(eff["segmentId"], str)
                and _num(eff["pod"]) and 0 <= eff["pod"] <= 1 and isinstance(i, dict)
                and set(i) == {"coverage", "sweepWidthM", "trackLengthM", "areaM2", "rdBasis"}
                and _num(i["coverage"]) and i["coverage"] >= 0
                and all(i[k] is None or (_num(i[k]) and i[k] >= 0) for k in ("sweepWidthM", "trackLengthM"))
                and _num(i["areaM2"]) and i["areaM2"] > 0 and i["rdBasis"] in RD_BASES)
    if kind == "clue":
        infl = eff.get("influences")
        return (set(eff) == {"kind", "influences", "authenticity"} and isinstance(infl, dict) and len(infl) >= 1
                and all(isinstance(k, str) and v in INFLUENCES for k, v in infl.items())
                and eff["authenticity"] in ("high", "medium", "low"))
    if kind == "none":
        return set(eff) == {"kind", "why"} and eff["why"] in NONE_REASONS
    return False


def malformed_event_ids(docs):
    """Ids of stored events whose effect is malformed, for a banner at command. Sorted, deduplicated."""
    return sorted({d["eventId"] for d in docs if not well_formed_effect(d.get("effect"))})


def stored_clear_is_consistent(eff):
    """A stored clear counts only when its pod is what its coverage gives."""
    c, p_ = eff["inputs"]["coverage"], eff["pod"]
    if not (isinstance(c, (int, float)) and math.isfinite(c) and c >= 0):
        return False
    if not (isinstance(p_, (int, float)) and math.isfinite(p_)):
        return False
    return abs(p_ - pod(c)) <= POD_CONSISTENCY_TOLERANCE


def to_engine_events(docs, prior_input_ids):
    """Retractions count from command or the target's own author. Confirmations
    count from command or family. A command confirmation outranks any family one
    for the same target (clientTimeMs is set by the writer, so a skewed family
    clock must not override command); within one role the latest by
    (clientTimeMs, eventId) wins."""
    by_id = {}
    for d in docs:
        by_id.setdefault(d["eventId"], d)
    prior_inputs = set(prior_input_ids)
    retracted = set()
    for d in by_id.values():
        target = by_id.get(d["targetEventId"]) if d["type"] == "retraction" else None
        if target is not None and (d["role"] == "command" or d["authorUid"] == target["authorUid"]):
            retracted.add(target["eventId"])
    latest = {}
    for d in by_id.values():
        if (d["type"] == "confirmation" and d["role"] in ("command", "family") and d["targetEventId"] is not None
                and d["decision"] in ("confirmed", "rejected") and d["eventId"] not in retracted):
            key = (1 if d["role"] == "command" else 0, d["clientTimeMs"], d["eventId"])
            t = d["targetEventId"]
            if t not in latest or key > latest[t][0]:
                latest[t] = (key, d["decision"])
    out = []
    for eid in sorted(by_id):
        d = by_id[eid]
        if eid in prior_inputs or eid in retracted:
            continue
        eff, kind = d.get("effect"), d["type"]
        if not well_formed_effect(eff):
            continue
        likely = eff["kind"] == "clue" and eff["authenticity"] in ("high", "medium")
        if kind == "cleared" and eff["kind"] == "cleared" and stored_clear_is_consistent(eff):
            out.append({"eventId": eid, "effect": eff})
        elif kind == "clue" and likely:
            out.append({"eventId": eid, "effect": eff})
        elif kind == "sighting" and likely and latest.get(eid, (None, None))[1] == "confirmed":
            out.append({"eventId": eid, "effect": eff})
    return out


def posterior(prior, events, p):
    ids = [s["segmentId"] for s in prior]
    prior_poa = {s["segmentId"]: s["priorPoa"] for s in prior}
    w = dict(prior_poa)
    not_cleared = {s: 1.0 for s in ids}
    applied, ignored, seen = [], [], set()
    for e in sorted(events, key=lambda e: e["eventId"]):
        eid = e["eventId"]
        if eid in seen:
            continue
        seen.add(eid)
        eff = e["effect"]
        if eff["kind"] == "cleared":
            s = eff["segmentId"]
            if s not in w:
                ignored.append(eid)
                continue
            f = 1 - eff["pod"]
            w[s] = w[s] * f
            not_cleared[s] = not_cleared[s] * f
            applied.append(eid)
        elif eff["kind"] == "clue":
            override = e.get("iocOverride")
            listed = override if override is not None else eff["influences"]
            if not any(s in w for s in listed):
                ignored.append(eid)
                continue
            for s in ids:
                if override is not None:
                    if s in override:
                        w[s] = w[s] * override[s]
                else:
                    w[s] = w[s] * ioc(eff["influences"].get(s, "neutral"), eff["authenticity"], p)
            applied.append(eid)
        else:
            ignored.append(eid)
    total = 0.0
    for s in ids:
        total = total + w[s]
    return {
        "poa": {s: (w[s] / total if total > 0 else 0.0) for s in ids},
        "remainingMass": {s: prior_poa[s] * not_cleared[s] for s in ids},
        "cumulativePod": {s: 1 - not_cleared[s] for s in ids},
        "appliedEventIds": applied,
        "ignoredEventIds": ignored,
    }


def rank_segments(result, prior):
    rows = [s for s in prior if s["segmentId"] != "ROW"]
    rows.sort(key=lambda s: (-result["poa"][s["segmentId"]], s["segmentId"]))
    return [{"segmentId": s["segmentId"], "rank": i + 1, "poa": result["poa"][s["segmentId"]],
             "priorPoa": s["priorPoa"], "deltaPoa": result["poa"][s["segmentId"]] - s["priorPoa"]}
            for i, s in enumerate(rows)]


# ---------------------------------------------------------------- ids

def frame(fields):
    out = b""
    for f in fields:
        data = f.encode("utf-8")
        out += len(data).to_bytes(4, "big") + data
    return out


def text_frame(fields):
    """eventId framing: decimal UTF-8 byte length, ":", value, per field. The security rules can build this
    string, so they can check that an event's id belongs to its own incident, device and seq."""
    return "".join(f"{len(f.encode('utf-8'))}:{f}" for f in fields)


def event_id(incident_id, device_id, seq):
    return hashlib.sha256(text_frame([incident_id, device_id, str(seq)]).encode("utf-8")).hexdigest()[:32]


def event_set_hash(prior_version, event_ids):
    return hashlib.sha256(frame([str(prior_version)] + sorted(set(event_ids)))).hexdigest()


def convergence_code(h):
    bits = int(h[:5], 16)
    return "".join(CROCKFORD[(bits >> shift) & 31] for shift in (15, 10, 5, 0))


# ---------------------------------------------------------------- router (Swift only)

def decide(i):
    """Step 1 on-device, step 2 cloud, else rules. Cloud and rules carry the step 1 reason."""
    if not i["onDeviceAvailable"]:
        fail = "on_device_unavailable"
    elif not i["localeSupported"]:
        fail = "locale_unsupported"
    elif i["contextSize"] <= 0 or i["estimatedTokens"] > i["contextSize"] * i["tokenBudgetFraction"]:
        fail = "over_token_budget"
    else:
        return {"path": "on_device", "reason": "on_device_default" if i["networkOnline"] else "no_network"}
    if i["networkOnline"] and i["cloudConsent"] and not i["killCloud"]:
        return {"path": "cloud", "reason": fail}
    return {"path": "rules", "reason": fail}


def after_failure(failure, path, stage):
    """A block or refusal never leads to the cloud. A model that was not ready on-device
    (not a block) may be re-decided with on-device marked unavailable."""
    if stage in ("deterministic_parser", "evidence_protocol"):
        return {"next": "pick_list"}
    first_on_device = path == "on_device" and stage == "guided"
    if failure in ("guardrail_block", "refusal"):
        return {"next": "stage", "stage": "permissive_text"} if first_on_device else {"next": "stage", "stage": "deterministic_parser"}
    if failure in ("unavailable", "context_exceeded"):
        return {"next": "reroute_without_on_device"} if first_on_device else {"next": "stage", "stage": "deterministic_parser"}
    return {"next": "stage", "stage": "deterministic_parser"}


# ---------------------------------------------------------------- evidence pre-screen

def words(text):
    """NFKD fold, drop combining marks, lowercase, split on anything that is not
    a letter or a digit (Unicode general categories L* and N*)."""
    folded = "".join(c for c in unicodedata.normalize("NFKD", text)
                     if not unicodedata.category(c).startswith("M"))
    out, cur = [], ""
    for c in folded.lower():
        if unicodedata.category(c)[0] in ("L", "N"):
            cur += c
        elif cur:
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out


def is_possible_evidence(text):
    tw = words(text)
    for term in TERMS:
        t = words(term)
        for i in range(len(tw) - len(t) + 1):
            if tw[i:i + len(t)] == t:
                return True
    return False


# ---------------------------------------------------------------- fixtures

def reading(**kw):
    r = {"kind": "cleared", "segmentIds": [], "method": "visual", "coverage": None, "minutes": None,
         "searchers": None, "searchType": "sweep", "detectionRangeM": None, "item": "", "feature": "none",
         "direction": "unknown", "topColor": "unknown", "bottomColor": "unknown", "footwear": "",
         "carried": "", "matchesProfile": "unknown", "evidenceQuote": ""}
    r.update(kw)
    return r


def seg(area, neighbors, upstream=(), downstream=()):
    return {"areaM2": area, "neighbors": [{"segmentId": s, "bearingDeg": b} for s, b in neighbors],
            "upstream": list(upstream), "downstream": list(downstream)}


# 3 x 2 grid of 125 m cells; AE is a 100,000 m2 test segment. A creek runs AC -> AB -> AA.
GRID = {
    "AA": seg(15625, [("AB", 90), ("AD", 180)], upstream=["AB"]),
    "AB": seg(15625, [("AA", 270), ("AC", 90), ("AE", 180)], upstream=["AC"], downstream=["AA"]),
    "AC": seg(15625, [("AB", 270), ("AF", 180)], downstream=["AB"]),
    "AD": seg(15625, [("AA", 0), ("AE", 90)]),
    "AE": seg(100000, [("AB", 0), ("AD", 270), ("AF", 90)]),
    "AF": seg(15625, [("AC", 0), ("AE", 270)]),
}
POS = {"lat": 33.7, "lon": -84.3, "accuracyM": 8}


def ctx(**kw):
    c = {"segments": GRID, "assignedSegmentIds": ["AC"], "visualDetectionRangeM": 10,
         "rdBasis": "open_target", "position": None, "positionSegmentId": None}
    c.update(kw)
    return c


def params(**kw):
    p = json.loads(json.dumps(PARAMS))
    p.update(kw)
    return p


INCIDENT = "drill-2026-11-22"


def doc(device, seq, type_, effect, **kw):
    d = {"eventId": event_id(INCIDENT, device, seq), "schemaVersion": 1, "incidentId": INCIDENT,
         "teamId": "T1", "deviceId": device, "seq": seq, "authorUid": "uid-" + device,
         "role": "searcher", "type": type_, "reporter": "searcher",
         "clientTimeMs": 1795860000000 + seq * 60000, "serverTime": None, "observedAtMs": None,
         "position": None, "positionSource": "assigned_segment", "rawText": None, "inputMethod": "typed",
         "isTrainingInject": False, "reading": None, "effect": effect, "route": None,
         "targetEventId": None, "decision": None, "planVersion": None, "priorVersion": 1}
    d.update(kw)
    return d


def ev(eid, effect, **extra):
    e = {"eventId": eid, "effect": effect}
    e.update(extra)
    return e


def cleared_eff(s, p_):
    return {"kind": "cleared", "segmentId": s, "pod": p_,
            "inputs": {"coverage": -math.log(1 - p_), "sweepWidthM": None, "trackLengthM": None,
                       "areaM2": 15625, "rdBasis": "open_target"}}


def clue_eff(influences, authenticity):
    return {"kind": "clue", "influences": influences, "authenticity": authenticity}


def prior_of(pairs):
    return [{"segmentId": s, "priorPoa": v} for s, v in pairs]


def hexid(n):
    return f"{n:032x}"


# ---------------------------------------------------------------- cases

def build():
    v = {"sections": SECTIONS}
    P = PARAMS

    v["pod"] = [{"name": n, "input": {"coverage": c}, "expected": pod(c)}
                for n, c in [("coverage_0", 0), ("coverage_0_5", 0.5), ("coverage_1", 1),
                             ("coverage_0_5196555", 0.5196555), ("coverage_3", 3)]]

    v["trackLength"] = [
        {"name": n, "input": {"minutes": m, "searchers": k, "searchType": t, "params": P},
         "expected": track_length(m, k, t, P)}
        for n, m, k, t in [("sweep_30min_4", 30, 4, "sweep"), ("sweep_45min_3", 45, 3, "sweep"),
                           ("hasty_20min_2", 20, 2, "hasty"), ("unknown_type_uses_sweep_10min_1", 10, 1, "unknown")]]

    v["ioc"] = [
        {"name": f"{i}_{a}", "input": {"influence": i, "authenticity": a, "params": P}, "expected": ioc(i, a, P)}
        for i, a in [("strong_for", "high"), ("for", "medium"), ("neutral", "high"), ("neutral", "medium"),
                     ("against", "medium"), ("strong_against", "high"), ("strong_for", "low")]]

    # posterior
    pa = prior_of([("A", 0.5), ("B", 0.3), ("ROW", 0.2)])
    pf = prior_of([("A", 0.3), ("B", 0.5), ("ROW", 0.2)])
    pc = prior_of([("S1", 0.31), ("S2", 0.31), ("S3", 0.31), ("S4", 0.07)])
    p6 = prior_of([("AA", 0.2), ("AB", 0.2), ("AC", 0.15), ("AD", 0.15), ("AE", 0.1), ("AF", 0.1), ("ROW", 0.1)])
    walker_table_path = ROOT / "shared/engine-ts/test/fixtures/toy-walker-table.json"
    walker_table = json.loads(walker_table_path.read_text())
    walker_prior = walker_table["segments"] + prior_of([("ROW", walker_table["row"])])
    casie = ev(hexid(1), clue_eff({}, "high"), iocOverride={"S1": 0.917, "S2": 1, "S3": 0.5, "S4": 0.771})
    post_cases = [
        ("no_events_returns_prior", pa, []),
        ("bayes_cleared_half", pa, [ev(hexid(1), cleared_eff("A", 0.5))]),
        ("frost_remaining", pf, [ev(hexid(1), cleared_eff("A", 0.5))]),
        ("casie_worked_example", pc, [casie]),
        ("two_clears_same_segment", pa, [ev(hexid(1), cleared_eff("A", 0.5)), ev(hexid(2), cleared_eff("A", 0.4))]),
        ("clue_strong_for_high_others_neutral", p6, [ev(hexid(1), clue_eff({"AB": "strong_for"}, "high"))]),
        ("clue_medium_with_neighbor", p6,
         [ev(hexid(1), clue_eff({"AB": "strong_for", "AA": "for"}, "medium"))]),
        ("clear_then_clue_mixed", p6, [ev(hexid(2), clue_eff({"AE": "strong_for"}, "high")),
                                       ev(hexid(1), cleared_eff("AC", 0.55))]),
        ("unknown_segment_is_ignored", pa, [ev(hexid(1), cleared_eff("ZZ", 0.5)), ev(hexid(2), cleared_eff("B", 0.2))]),
        ("none_effect_is_ignored", pa, [ev(hexid(1), none("informational"))]),
        ("duplicate_event_applied_once", pa, [ev(hexid(1), cleared_eff("A", 0.5)), ev(hexid(1), cleared_eff("A", 0.5))]),
        ("walker_prior_then_cleared", walker_prior, [ev(hexid(1), cleared_eff("AA", 0.5))]),
    ]
    v["posterior"] = [{"name": n, "input": {"prior": pr, "events": es, "params": P},
                       "expected": posterior(pr, es, P)} for n, pr, es in post_cases]

    sorted_events = [ev(hexid(1), cleared_eff("AC", 0.55)), ev(hexid(2), clue_eff({"AE": "strong_for", "AF": "for"}, "high")),
                     ev(hexid(3), cleared_eff("AE", 0.405)), ev(hexid(4), clue_eff({"AA": "strong_for"}, "medium"))]
    shuffled = [sorted_events[i] for i in (2, 0, 3, 1)]
    v["orderIndependence"] = [
        {"name": "four_events_shuffled", "input": {"prior": p6, "events": shuffled, "params": P},
         "expected": posterior(p6, sorted_events, P)},
        {"name": "reversed_with_duplicate", "input": {"prior": p6, "events": list(reversed(sorted_events)) + [sorted_events[0]],
                                                     "params": P},
         "expected": posterior(p6, sorted_events, P)},
    ]

    # deriveEffect
    de = []

    def dcase(name, fn, r, c=None, p_=None):
        c = c if c is not None else ctx()
        inp = {"fn": fn, "reading": r, "ctx": c}
        if fn == "cleared":
            p_ = p_ if p_ is not None else P
            inp["params"] = p_
            out = derive_cleared(r, c, p_)
        else:
            out = derive_clue(r, c)
        de.append({"name": name, "input": inp, "expected": out})

    clear = lambda **kw: reading(kind="cleared", **kw)  # noqa: E731
    dcase("sweep_45min_3_searchers_100000m2_rd10", "cleared", clear(segmentIds=["AE"], minutes=45, searchers=3))
    dcase("coverage_80_percent", "cleared", clear(segmentIds=["AB"], coverage=80))
    dcase("coverage_0_8_ratio", "cleared", clear(segmentIds=["AB"], coverage=0.8))
    dcase("coverage_3_ratio_kept", "cleared", clear(segmentIds=["AB"], coverage=3))
    dcase("coverage_150_percent", "cleared", clear(segmentIds=["AB"], coverage=150))
    dcase("coverage_400_invalid", "cleared", clear(segmentIds=["AB"], coverage=400))
    dcase("coverage_negative_invalid", "cleared", clear(segmentIds=["AB"], coverage=-1))
    dcase("sound_only_gives_none", "cleared", clear(segmentIds=["AB"], method="sound", minutes=30, searchers=2))
    dcase("sound_counts_when_profile_allows", "cleared", clear(segmentIds=["AB"], method="sound", minutes=30, searchers=2),
          p_=params(detectionProfile={"soundCounts": True}))
    dcase("both_method_counts", "cleared", clear(segmentIds=["AB"], method="both", minutes=30, searchers=2))
    dcase("no_ids_and_no_position_uses_assigned", "cleared", clear(coverage=1.0), ctx(assignedSegmentIds=["AC"]))
    dcase("unknown_id_falls_back_to_assigned", "cleared", clear(segmentIds=["ZZ"], coverage=1.0))
    dcase("second_id_used_when_first_unknown", "cleared", clear(segmentIds=["ZZ", "AD"], coverage=1.0))
    dcase("missing_minutes_needs_command", "cleared", clear(segmentIds=["AB"], searchers=3))
    dcase("missing_detection_range_needs_command", "cleared", clear(segmentIds=["AB"], minutes=30, searchers=3),
          ctx(visualDetectionRangeM=None, rdBasis="default"))
    dcase("no_segment_needs_command", "cleared", clear(coverage=1.0), ctx(assignedSegmentIds=[]))
    dcase("hasty_uses_hasty_speed", "cleared", clear(segmentIds=["AB"], minutes=20, searchers=2, searchType="hasty"))
    dcase("unknown_search_type_uses_sweep", "cleared", clear(segmentIds=["AB"], minutes=20, searchers=2, searchType="unknown"))
    dcase("measured_range_beats_stated", "cleared", clear(segmentIds=["AB"], minutes=20, searchers=2, detectionRangeM=5),
          ctx(rdBasis="hidden_target"))
    dcase("stated_range_used_without_measurement", "cleared", clear(segmentIds=["AB"], minutes=20, searchers=2, detectionRangeM=5),
          ctx(visualDetectionRangeM=None, rdBasis="default"))
    dcase("hidden_target_basis_kept", "cleared", clear(segmentIds=["AB"], minutes=20, searchers=2), ctx(rdBasis="hidden_target"))
    dcase("not_a_clear_is_invalid", "cleared", reading(kind="sighting", segmentIds=["AB"]))
    clue = lambda **kw: reading(kind="clue", **kw)  # noqa: E731
    at_ab = ctx(position=POS, positionSegmentId="AB")
    dcase("clue_at_position_direction_unknown", "clue", clue(), at_ab)
    dcase("clue_direction_e_marks_one_neighbor", "clue", clue(direction="e", matchesProfile="consistent"), at_ab)
    dcase("clue_direction_se_marks_two_neighbors", "clue", clue(direction="se"), at_ab)
    dcase("clue_downstream_neighbor", "clue", clue(direction="downstream"), at_ab)
    dcase("clue_upstream_neighbor", "clue", clue(direction="upstream"), at_ab)
    dcase("clue_outside_grid", "clue", clue(direction="n"), ctx(position=POS, positionSegmentId=None))
    dcase("clue_no_position_uses_reading_segment", "clue", clue(segmentIds=["AF"], direction="w"))
    dcase("clue_no_position_uses_assigned", "clue", clue(direction="s"))
    dcase("clue_inconsistent_is_low", "clue", clue(matchesProfile="inconsistent"), at_ab)
    dcase("sighting_kind_derives_clue", "clue", reading(kind="sighting", direction="w", matchesProfile="consistent"), at_ab)
    dcase("clue_nothing_known_needs_command", "clue", clue(), ctx(assignedSegmentIds=[]))
    dcase("cleared_kind_is_invalid_for_clue", "clue", reading(kind="cleared"), at_ab)
    v["deriveEffect"] = de

    # docToEngine
    ce = cleared_eff("AB", 0.5)
    hi = clue_eff({"AB": "strong_for", "AA": "for"}, "high")
    md = clue_eff({"AE": "strong_for"}, "medium")
    lo = clue_eff({"AE": "strong_for"}, "low")
    sight = doc("pub1", 1, "sighting", hi, role="command", reporter="public_caller", teamId=None,
                positionSource="map_click", position=POS, observedAtMs=1795860000000)
    confirm = lambda target, decision, seq, **kw: doc("cmd1", seq, "confirmation", none("informational"), role="command",  # noqa: E731
                                                      reporter="system", teamId=None, targetEventId=target,
                                                      decision=decision, **kw)
    cam = doc("fam1", 1, "camera_sighting", none("incorporated_in_prior"), role="family", reporter="camera",
              teamId=None, inputMethod="clip", positionSource="camera_pin", position=POS)
    dest = doc("cmd1", 7, "destination", none("incorporated_in_prior"), role="command", reporter="family",
               teamId=None, positionSource="map_click", position=POS)
    clear_doc = doc("dev1", 1, "cleared", ce)
    out_sight = doc("pub1", 2, "sighting", none("outside_area"), role="command", reporter="public_caller",
                    teamId=None, positionSource="map_click", position=POS)
    d2e = [
        ("cleared_counts", [clear_doc], []),
        ("cleared_with_none_effect_ignored", [doc("dev1", 2, "cleared", none("sound_only"))], []),
        ("clue_high_counts", [doc("dev1", 3, "clue", hi)], []),
        ("clue_medium_counts", [doc("dev1", 4, "clue", md)], []),
        ("clue_low_authenticity_ignored", [doc("dev1", 5, "clue", lo)], []),
        ("unconfirmed_sighting_ignored", [sight], []),
        ("confirmed_public_sighting", [sight, confirm(sight["eventId"], "confirmed", 1)], []),
        ("rejected_sighting_ignored", [sight, confirm(sight["eventId"], "rejected", 1)], []),
        ("confirmed_then_rejected_ignored", [sight, confirm(sight["eventId"], "confirmed", 1),
                                             confirm(sight["eventId"], "rejected", 2)], []),
        ("rejected_then_confirmed_counts", [sight, confirm(sight["eventId"], "rejected", 1),
                                            confirm(sight["eventId"], "confirmed", 2)], []),
        ("family_confirm_after_command_reject_ignored",
         [sight, confirm(sight["eventId"], "rejected", 1),
          doc("fam1", 3, "confirmation", none("informational"), role="family", reporter="family", teamId=None,
              targetEventId=sight["eventId"], decision="confirmed", clientTimeMs=1795869999000)], []),
        ("command_confirm_after_family_reject_counts",
         [sight, doc("fam1", 4, "confirmation", none("informational"), role="family", reporter="family", teamId=None,
                     targetEventId=sight["eventId"], decision="rejected", clientTimeMs=1795869999000),
          confirm(sight["eventId"], "confirmed", 1)], []),
        ("retracted_confirmation_unconfirms", [sight, confirm(sight["eventId"], "confirmed", 1),
                                               doc("cmd1", 3, "retraction", none("informational"), role="command",
                                                   targetEventId=event_id(INCIDENT, "cmd1", 1))], []),
        ("retracted_clear_removed", [clear_doc, doc("dev1", 9, "retraction", none("informational"),
                                                    targetEventId=clear_doc["eventId"])], []),
        ("duplicate_doc_once", [clear_doc, dict(clear_doc)], []),
        ("searcher_confirmation_ignored", [sight, doc("dev1", 12, "confirmation", none("informational"),
                                                     targetEventId=sight["eventId"], decision="confirmed")], []),
        ("family_confirmation_counts", [sight, doc("fam1", 2, "confirmation", none("informational"), role="family",
                                                   reporter="family", teamId=None, targetEventId=sight["eventId"],
                                                   decision="confirmed")], []),
        ("retraction_by_other_searcher_ignored", [clear_doc, doc("dev2", 9, "retraction", none("informational"),
                                                                 targetEventId=clear_doc["eventId"])], []),
        ("command_retracts_other_author", [clear_doc, doc("cmd1", 8, "retraction", none("informational"), role="command",
                                                          targetEventId=clear_doc["eventId"])], []),
        ("inconsistent_stored_clear_dropped", [doc("dev1", 13, "cleared", dict(ce, pod=0.9))], []),
        ("malformed_cleared_without_inputs_skipped",
         [doc("dev3", 1, "cleared", {"kind": "cleared", "segmentId": "AB", "pod": 0.5})], []),
        ("malformed_cleared_pod_as_text_skipped", [doc("dev3", 2, "cleared", dict(ce, pod="0.5"))], []),
        ("malformed_cleared_unknown_rd_basis_skipped",
         [doc("dev3", 3, "cleared", dict(ce, inputs=dict(ce["inputs"], rdBasis="guess")))], []),
        ("malformed_clue_unknown_influence_skipped",
         [doc("dev3", 4, "clue", clue_eff({"AB": "certain"}, "high"))], []),
        ("malformed_clue_empty_influences_skipped", [doc("dev3", 5, "clue", clue_eff({}, "high"))], []),
        ("malformed_effect_null_skipped", [doc("dev3", 6, "cleared", None)], []),
        ("malformed_none_without_reason_skipped", [doc("dev3", 7, "found", {"kind": "none"})], []),
        ("malformed_beside_good_events_keeps_the_good",
         [doc("dev3", 8, "cleared", {"kind": "cleared", "segmentId": "AB", "pod": 0.5}), clear_doc,
          doc("dev1", 15, "clue", hi)], []),
        ("large_computed_coverage_counts", [doc("dev1", 14, "cleared", cleared_eff("AB", 1 - math.exp(-5.2)))], []),
        ("confirmed_camera_sighting", [cam, confirm(cam["eventId"], "confirmed", 4)], [cam["eventId"]]),
        ("camera_sighting_never_a_likelihood", [cam, confirm(cam["eventId"], "confirmed", 4)], []),
        ("confirmed_destination", [dest, confirm(dest["eventId"], "confirmed", 5)], [dest["eventId"]]),
        ("sighting_promoted_to_start_point", [sight, confirm(sight["eventId"], "confirmed", 1)], [sight["eventId"]]),
        ("sighting_outside_grid_ignored", [out_sight, confirm(out_sight["eventId"], "confirmed", 6)], []),
        ("found_and_plan_ack_have_no_effect", [doc("dev1", 10, "found", none("informational")),
                                               doc("dev1", 11, "plan_ack", none("informational"), planVersion=2)], []),
        ("mixed_output_sorted_by_event_id", [doc("dev2", 1, "cleared", cleared_eff("AE", 0.3)), clear_doc,
                                             doc("dev1", 3, "clue", hi), doc("dev2", 2, "clue", md)], []),
    ]
    v["docToEngine"] = [{"name": n, "input": {"docs": docs, "priorInputEventIds": pii},
                         "expected": to_engine_events(docs, pii)} for n, docs, pii in d2e]

    # rank
    tie_prior = prior_of([("AB", 0.3), ("AA", 0.3), ("AC", 0.2), ("ROW", 0.2)])
    v["rank"] = [
        {"name": "bayes_after_clear", "input": {"result": posterior(pa, [ev(hexid(1), cleared_eff("A", 0.5))], P),
                                                "prior": pa}},
        {"name": "ties_break_by_segment_id", "input": {"result": posterior(tie_prior, [], P), "prior": tie_prior}},
        {"name": "clue_reorders_six", "input": {"result": posterior(p6, sorted_events, P), "prior": p6}},
    ]
    for c in v["rank"]:
        c["expected"] = rank_segments(c["input"]["result"], c["input"]["prior"])

    # ids
    ids = []

    def id_case(name, inc, dev, seq):
        ids.append({"name": name, "input": {"fn": "eventId", "incidentId": inc, "deviceId": dev, "seq": seq},
                    "expected": {"eventId": event_id(inc, dev, seq)}})

    def set_case(name, pv, eids):
        h = event_set_hash(pv, eids)
        ids.append({"name": name, "input": {"fn": "eventSet", "priorVersion": pv, "eventIds": eids},
                    "expected": {"eventSetHash": h, "convergenceCode": convergence_code(h)}})

    def code_case(name, h):
        ids.append({"name": name, "input": {"fn": "convergenceCode", "hash": h},
                    "expected": {"convergenceCode": convergence_code(h)}})

    id_case("ab_c_1", "ab", "c", 1)
    id_case("a_bc_1", "a", "bc", 1)
    id_case("drill_device_seq_12", INCIDENT, "6F1C2A90-4B4D-4E0B-9C8F-1D2E3F405162", 12)
    id_case("seq_10_differs_from_1_0", "i", "d1", 10)
    id_case("seq_0_on_device_d10", "i", "d10", 0)
    id_case("utf8_lengths_are_bytes", "café", "équipe", 3)
    id_case("epoch_ms_seq", "drill-dev-1", "uid123ABC", 1795860000000)
    e3 = [event_id(INCIDENT, "dev1", n) for n in (1, 2, 3)]
    set_case("event_set_empty_v1", 1, [])
    set_case("event_set_three_v1", 1, e3)
    set_case("event_set_reordered_with_duplicate", 1, [e3[2], e3[0], e3[1], e3[0]])
    set_case("event_set_three_v2", 2, e3)
    set_case("event_set_one_v10", 10, [e3[0]])
    code_case("code_all_zeros", "0" * 64)
    code_case("code_all_ones", "f" * 64)
    code_case("code_ones_in_each_group", "08421" + "0" * 59)
    v["ids"] = ids

    # router
    base_in = {"taskClass": "field_report", "networkOnline": True, "onDeviceAvailable": True, "localeSupported": True,
               "estimatedTokens": 900, "contextSize": 4096, "tokenBudgetFraction": 0.5, "cloudConsent": True,
               "killCloud": False}

    def rin(**kw):
        i = dict(base_in)
        i.update(kw)
        return i

    router = [
        ("online_on_device_default", rin()),
        ("offline_on_device", rin(networkOnline=False)),
        ("on_device_unavailable_goes_cloud", rin(onDeviceAvailable=False)),
        ("locale_unsupported_goes_cloud", rin(localeSupported=False)),
        ("over_token_budget_goes_cloud", rin(estimatedTokens=2049)),
        ("token_budget_boundary_stays_on_device", rin(estimatedTokens=2048)),
        ("context_size_zero_is_over_budget", rin(contextSize=0)),
        ("on_device_unavailable_offline_rules", rin(onDeviceAvailable=False, networkOnline=False)),
        ("no_consent_rules_keep_step1_reason", rin(onDeviceAvailable=False, cloudConsent=False)),
        ("kill_cloud_rules_keep_step1_reason", rin(localeSupported=False, killCloud=True)),
        ("over_budget_offline_rules", rin(estimatedTokens=5000, networkOnline=False)),
    ]
    v["router"] = [{"name": n, "input": {"fn": "decide", "input": i}, "expected": decide(i)} for n, i in router]
    failures = [
        ("block_guided_on_device_goes_permissive", "guardrail_block", "on_device", "guided"),
        ("refusal_guided_on_device_goes_permissive", "refusal", "on_device", "guided"),
        ("block_permissive_goes_parser", "guardrail_block", "on_device", "permissive_text"),
        ("refusal_permissive_goes_parser", "refusal", "on_device", "permissive_text"),
        ("block_parser_goes_pick_list", "guardrail_block", "on_device", "deterministic_parser"),
        ("parse_failed_parser_goes_pick_list", "parse_failed", "on_device", "deterministic_parser"),
        ("block_on_cloud_goes_parser_not_cloud", "guardrail_block", "cloud", "guided"),
        ("other_error_guided_goes_parser", "other", "on_device", "guided"),
        ("network_on_cloud_goes_parser", "network", "cloud", "guided"),
        ("app_check_refused_goes_parser", "app_check_refused", "cloud", "guided"),
        ("cancelled_goes_parser", "cancelled", "on_device", "guided"),
        ("unavailable_guided_on_device_reroutes", "unavailable", "on_device", "guided"),
        ("context_exceeded_guided_on_device_reroutes", "context_exceeded", "on_device", "guided"),
        ("unavailable_on_cloud_goes_parser", "unavailable", "cloud", "guided"),
        ("context_exceeded_permissive_goes_parser", "context_exceeded", "on_device", "permissive_text"),
        ("block_at_sdk_stage_goes_parser", "guardrail_block", "on_device", "sdk"),
        ("evidence_protocol_stage_goes_pick_list", "other", "rules", "evidence_protocol"),
    ]
    v["router"] += [{"name": n, "input": {"fn": "afterFailure", "failure": f, "path": pth, "stage": st},
                     "expected": after_failure(f, pth, st)} for n, f, pth, st in failures]

    texts = [
        ("blood_on_a_rock", "Found blood on a rock by the creek"),
        ("cleared_segment_ac", "Cleared segment AC, 80 percent coverage"),
        ("uppercase_knife", "KNIFE near the trail head"),
        ("punctuation_after_term", "There are bones."),
        ("multi_word_shell_casing", "We found a shell casing in AB"),
        ("shell_alone_is_not_casing", "Only a sea shell by the water"),
        ("bloodhound_is_not_blood", "Bloodhound team cleared AD"),
        ("begun_is_not_gun", "Sweep of AE has begun"),
        ("empty_text", ""),
        ("accents_fold_into_words", "Found BL\u00d3OD on a rock"),
        ("accent_inside_word_is_not_term", "caf\u00e9 bones\u00e9"),
        ("apostrophes_split_words", "the dog's blood's on it"),
        ("fullwidth_letters_fold", "\uff4b\uff4e\uff49\uff46\uff45 in the brush"),
        ("body_of_water_flags", "Searched the edge of a body of water"),
        ("clothing_report_is_clean", "Saw a red jacket on a branch in AF"),
    ]
    v["evidence"] = [{"name": n, "input": {"text": t}, "expected": is_possible_evidence(t)} for n, t in texts]
    return v


def render():
    return json.dumps(build(), indent=1) + "\n"


def main(argv):
    text = render()
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text() != text:
            print(f"{OUT.relative_to(ROOT)} is stale: run python3 -I tools/vectors/make_vectors.py")
            return 1
        print("search.json is current")
        return 0
    OUT.write_text(text)
    v = json.loads(text)
    print(f"wrote {OUT.relative_to(ROOT)}: " + ", ".join(f"{s} {len(v[s])}" for s in SECTIONS)
          + f"; total {sum(len(v[s]) for s in SECTIONS)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
