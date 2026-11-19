// What the post shows for each sighting: whether a person has decided on it,
// whether it still needs a place on the map, and whether it fell outside the
// search area. Decision order matches the engine: a command decision outranks
// a family one, and within one role the latest (clientTimeMs, eventId) wins.

import type { EventDoc } from "@pls/engine";

export type SightingCard = {
  sighting: EventDoc;
  status: "awaiting" | "confirmed" | "rejected";
  needsPlace: boolean;
  outside: boolean;
};

type Key = [number, number, string];
const greater = (a: Key, b: Key) => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]);

export function sightingCards(docs: readonly EventDoc[]): SightingCard[] {
  const byId = new Map<string, EventDoc>();
  for (const d of docs) if (!byId.has(d.eventId)) byId.set(d.eventId, d);
  const retracted = new Set<string>();
  for (const d of byId.values()) {
    if (d.type !== "retraction" || !d.targetEventId) continue;
    const t = byId.get(d.targetEventId);
    if (t && (d.role === "command" || d.authorUid === t.authorUid)) retracted.add(t.eventId);
  }
  const decided = new Map<string, { key: Key; decision: "confirmed" | "rejected" }>();
  for (const d of byId.values()) {
    if (d.type !== "confirmation" || !d.targetEventId || !d.decision || retracted.has(d.eventId)) continue;
    if (d.role !== "command" && d.role !== "family") continue;
    const key: Key = [d.role === "command" ? 1 : 0, d.clientTimeMs, d.eventId];
    const prev = decided.get(d.targetEventId);
    if (!prev || greater(key, prev.key)) decided.set(d.targetEventId, { key, decision: d.decision });
  }
  // A family sighting command placed on the map is shown as its placement (a command sighting that points at it).
  const placed = new Set<string>();
  for (const d of byId.values()) {
    if (d.type === "sighting" && d.role === "command" && d.targetEventId && !retracted.has(d.eventId)) placed.add(d.targetEventId);
  }
  return [...byId.values()]
    .filter((d) => d.type === "sighting" && !retracted.has(d.eventId) && !placed.has(d.eventId))
    .sort((a, b) => (b.observedAtMs ?? 0) - (a.observedAtMs ?? 0) || (a.eventId < b.eventId ? -1 : 1))
    .map((s) => ({
      sighting: s,
      status: decided.get(s.eventId)?.decision ?? "awaiting",
      needsPlace: s.position === null,
      outside: s.effect.kind === "none" && s.effect.why === "outside_area",
    }));
}
