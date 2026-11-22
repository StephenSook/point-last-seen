// Plan reasons as facts, not free text: code finds the facts that hold for each team's own segments, the model picks
// the one that matters most (the team's main reason), code adds a supporting fact by a fixed priority, and code writes
// every sentence from fixed templates and the plan's own values. Nothing a model writes reaches the page.

import type { PlanDraft } from "./replanWording";

/**
 * Every fact a reason can cite, in the order a team's list shows them: the most specific first (the newest report,
 * search state, features, the distance band), then the ranking every segment has.
 */
export const FACT_CODES = [
  "moved_by_last_report",
  "not_yet_searched",
  "searched_still_high",
  "near_trail",
  "near_road",
  "near_stream",
  "near_water",
  "near_building",
  "in_ring",
  "highest_poa",
  "top_three",
  "poa_rose",
  "poa_now",
] as const;
export type FactCode = (typeof FACT_CODES)[number];

/** A distance band from the last-seen point: its km and the ISRID percentages at its inner and outer edge. */
export type RingBand = { innerKm: number; outerKm: number; fromPct: number; toPct: number };
/** What the command post knows about one segment beyond the ranking. */
export type SegmentFacts = { featureClasses: readonly string[]; searched: boolean; raisedByLastReport: boolean; ring: RingBand | null };
export type PlanFacts = Readonly<Record<string, SegmentFacts>>;

// The grid's feature classes are every OSM class within 71 m of the segment (tools/grid-builder/src/features.ts).
const FEATURE: Record<string, FactCode> = { trail: "near_trail", road: "near_road", stream: "near_stream", water: "near_water", structure: "near_building" };
const TOP = 3;
/** A plan doc's reason holds at most 200 characters (firestore.rules validAssignment). */
export const MAX_REASON = 200;

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const km = (k: number) => k.toFixed(1);
const rose = (poa: number, priorPoa: number) => Number.parseFloat(pct(poa)) > Number.parseFloat(pct(priorPoa));

/**
 * For each team with segments, each fact that holds for at least one of its own segments, with those segments in the
 * plan's order. A team without segment facts (no grid data yet) has only the ranking's facts; poa_now holds for every
 * segment, so no team with a segment has an empty list.
 */
export function teamFacts(draft: PlanDraft): Map<string, Map<FactCode, string[]>> {
  const byId = new Map(draft.rank.map((r) => [r.segmentId, r]));
  const top = draft.rank.reduce((best, r) => (best === null || r.rank < best.rank ? r : best), null as PlanDraft["rank"][number] | null);
  const out = new Map<string, Map<FactCode, string[]>>();
  for (const a of draft.assignments) {
    if (a.segmentIds.length === 0) continue;
    const found = new Map<FactCode, string[]>();
    const add = (code: FactCode, id: string) => found.set(code, [...(found.get(code) ?? []), id]);
    for (const id of a.segmentIds) {
      const r = byId.get(id);
      const f = draft.facts?.[id];
      const highest = !!r && !!top && r.segmentId === top.segmentId;
      if (highest) add("highest_poa", id);
      // The highest is in the top three by definition, so saying both says one thing twice.
      if (r && r.rank <= TOP && !highest) add("top_three", id);
      if (r && rose(r.poa, r.priorPoa)) add("poa_rose", id);
      if (r) add("poa_now", id);
      if (f && !f.searched) add("not_yet_searched", id);
      if (f && f.searched && r && r.rank <= TOP) add("searched_still_high", id);
      if (f?.raisedByLastReport) add("moved_by_last_report", id);
      for (const cls of f?.featureClasses ?? []) if (FEATURE[cls]) add(FEATURE[cls]!, id);
      if (f?.ring) add("in_ring", id);
    }
    out.set(a.teamId, new Map(FACT_CODES.filter((c) => found.has(c)).map((c) => [c, found.get(c)!])));
  }
  return out;
}

// Pairs that say one thing twice: the highest POA and a rise each already give the current POA.
const REPEATS: readonly (readonly [FactCode, FactCode])[] = [["highest_poa", "poa_now"], ["poa_rose", "poa_now"]];
const repeats = (a: FactCode, b: FactCode) => REPEATS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/**
 * The fact code adds beside the model's main reason: the team's first fact in FACT_CODES order (the newest report,
 * search state, features, the distance band, then the ranking) other than the main one and not repeating it. None
 * when the team has no other fact, or no segment. A fixed rule, so no model judgment is claimed for it.
 */
export function supportingFact(draft: PlanDraft, teamId: string, main: FactCode): FactCode | null {
  const facts = teamFacts(draft).get(teamId);
  if (!facts) return null;
  return FACT_CODES.find((c) => c !== main && facts.has(c) && !repeats(main, c)) ?? null;
}

/** "AC", "AC and CC", "AC, CC and DD", or the first three and a count of the rest. */
function names(ids: readonly string[]): string {
  if (ids.length === 1) return ids[0]!;
  if (ids.length <= 3) return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
  return `${ids.slice(0, 3).join(", ")} and ${ids.length - 3} more`;
}

function sentence(draft: PlanDraft, code: FactCode, ids: readonly string[]): string {
  const one = ids.length === 1;
  const who = names(ids);
  const is = one ? "is" : "are";
  const row = (id: string) => draft.rank.find((r) => r.segmentId === id)!;
  const first = ids[0]!;
  switch (code) {
    case "highest_poa":
      return `${first} has the highest POA, ${pct(row(first).poa)}.`;
    case "top_three":
      return `${who} ${is} in the top three by POA.`;
    case "poa_rose": {
      const r = row(first);
      return one
        ? `${first} rose from ${pct(r.priorPoa)} to ${pct(r.poa)} since the starting map.`
        : `${who} rose since the starting map; ${first} from ${pct(r.priorPoa)} to ${pct(r.poa)}.`;
    }
    case "poa_now":
      return one
        ? `${first} POA now ${pct(row(first).poa)}.`
        : `POA now ${ids.slice(0, 3).map((id) => `${id} ${pct(row(id).poa)}`).join(", ")}${ids.length > 3 ? ` and ${ids.length - 3} more` : ""}.`;
    case "not_yet_searched":
      return `${who} ${one ? "has" : "have"} not been searched yet.`;
    case "searched_still_high":
      // "now", not "still": the segment may have entered the top three only after it was searched.
      return `${who} ${one ? "was" : "were"} searched and ${is} in the top three now.`;
    case "moved_by_last_report":
      return `The newest report raised ${who}.`;
    case "near_trail":
      return `${who} ${is} near a trail.`;
    case "near_road":
      return `${who} ${is} near a road.`;
    case "near_stream":
      return `${who} ${is} near a stream.`;
    case "near_water":
      return `${who} ${is} near water.`;
    case "near_building":
      return `${who} ${is} near a building.`;
    case "in_ring": {
      const b = draft.facts![first]!.ring!;
      return b.innerKm === 0
        ? `${first} is within ${km(b.outerKm)} km of the last-seen point, in the ISRID first ${b.toPct}% distance band.`
        : `${first} is ${km(b.innerKm)} to ${km(b.outerKm)} km from the last-seen point, in the ISRID ${b.fromPct} to ${b.toPct}% distance band.`;
    }
  }
}

/**
 * A team's reason from the facts chosen for it, in the order chosen. Each code must be one of the team's own facts
 * (the caller checks); when two do not fit the 200 characters a plan doc allows, only the first is shown.
 */
export function renderReason(draft: PlanDraft, teamId: string, codes: readonly FactCode[]): string {
  const facts = teamFacts(draft).get(teamId);
  const parts = codes.map((c) => sentence(draft, c, facts?.get(c) ?? []));
  const both = parts.join(" ");
  return both.length <= MAX_REASON ? both : parts[0]!;
}

/** The plan's summary, written from the same choices as the reasons: each team's task and its reason, in plan order. */
export function renderSummary(draft: PlanDraft, choices: ReadonlyMap<string, readonly FactCode[]>): string {
  return draft.assignments
    .map((a) =>
      a.segmentIds.length === 0
        ? `${a.teamId} has no segment left to assign.`
        : `${a.teamId} searches ${a.segmentIds.join(", ")}: ${renderReason(draft, a.teamId, choices.get(a.teamId) ?? [])}`,
    )
    .join(" ");
}

/**
 * The distance band (ring) a distance from the last-seen point falls in: the engine's ring radii, with each band's
 * ISRID percentages from the cumulative ring masses (engine-params.json: 25/50/75/95%). None beyond the last ring, or
 * when the radii and masses do not line up.
 */
export function ringBand(distanceKm: number, radiiKm: readonly number[], masses: readonly number[]): RingBand | null {
  if (radiiKm.length === 0 || radiiKm.length !== masses.length) return null;
  const i = radiiKm.findIndex((r) => distanceKm <= r);
  if (i < 0) return null;
  const cum = (n: number) => Math.round(masses.slice(0, n).reduce((s, m) => s + m, 0) * 100);
  return { innerKm: i === 0 ? 0 : radiiKm[i - 1]!, outerKm: radiiKm[i]!, fromPct: cum(i), toPct: cum(i + 1) };
}

type LatLon = { lat: number; lon: number };
const metresBetween = (a: LatLon, b: LatLon) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
};

export type FactInputs = {
  segments: readonly { segmentId: string; centroid: LatLon; featureClasses?: readonly string[] }[];
  /** The posterior's cumulative POD per segment: above 0 means a team has searched it. */
  cumulativePod: Readonly<Record<string, number>>;
  /** Segments a team reported clearing that the engine may not have credited (it credits one segment per clear). */
  searchedIds?: readonly string[];
  /** The segments the newest report raised. */
  raisedIds: readonly string[];
  /** The ring model's last-seen point, radii and masses; null when the map does not use the ring model. */
  ring: { ipp: LatLon; radiiKm: readonly number[]; masses: readonly number[] } | null;
};

/** Each segment's facts from what the command post already has: the grid's features, the posterior and the newest report. */
export function planFacts(input: FactInputs): Record<string, SegmentFacts> {
  const raised = new Set(input.raisedIds);
  const reported = new Set(input.searchedIds ?? []);
  return Object.fromEntries(
    input.segments.map((s) => [
      s.segmentId,
      {
        featureClasses: [...(s.featureClasses ?? [])],
        searched: (input.cumulativePod[s.segmentId] ?? 0) > 0 || reported.has(s.segmentId),
        raisedByLastReport: raised.has(s.segmentId),
        ring: input.ring ? ringBand(metresBetween(input.ring.ipp, s.centroid) / 1000, input.ring.radiiKm, input.ring.masses) : null,
      },
    ]),
  );
}
