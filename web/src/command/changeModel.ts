// What a report did to the map, in numbers and in one sentence: the changed
// segments (largest move first), a banner for the screen and a line for screen
// readers. Code and fixed copy only; no model writes any of it.

import type { EventDoc, ReportReading } from "@pls/engine";
import { formatPct } from "../map/poaStyle";

export type Changed = { segmentId: string; fromPct: number; toPct: number; deltaPts: number };
export type ChangeResult = { changed: Changed[]; banner: string; announce: string };

const WHERE: Partial<Record<ReportReading["feature"], string>> = {
  water: "in water", creek_or_drainage: "in the creek", trail: "on a trail", road: "on a road",
  structure: "at a building", brush: "in brush", woods: "in woods", field: "in a field",
};

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
// Lower-case the first letter for the spoken line, but never an all-caps segment id.
const spoken = (s: string) => (s.length > 1 && s[1] === s[1]!.toLowerCase() ? s[0]!.toLowerCase() + s.slice(1) : s);

function causeLabel(ev: EventDoc): string {
  const r = ev.reading && "kind" in ev.reading && "item" in ev.reading ? (ev.reading as ReportReading) : null;
  switch (ev.type) {
    case "clue": {
      const what = cap(r?.item.trim() || "Clue");
      const where = r ? WHERE[r.feature] : undefined;
      return where ? `${what} ${where}` : what;
    }
    case "cleared":
      return r && r.segmentIds.length > 0 ? `${r.segmentIds.join(", ")} cleared` : "Area cleared";
    case "sighting":
      return "Sighting";
    case "camera_sighting":
      return "Camera sighting";
    case "found":
      return "Found";
    case "destination":
      return "Place to check";
    case "confirmation":
      return ev.decision === "rejected" ? "Sighting rejected" : "Sighting confirmed";
    case "retraction":
      return "Report withdrawn";
    default:
      return "Report";
  }
}

// One decimal, the POA table's precision (formatPct), so the line, the chip and the table agree.
const pct = (v: number | undefined) => Number(((v ?? 0) * 100).toFixed(1));

const CONFIRM_SIGHTING = "Sighting saved. Confirm it under Sightings to move the map.";
const awaitsConfirm = (ev: EventDoc) =>
  ev.type === "sighting" && ev.effect.kind === "clue" && (ev.effect.authenticity === "high" || ev.effect.authenticity === "medium");

export function changeModel(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>, cause: EventDoc): ChangeResult {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((id) => id !== "ROW");
  const changed = ids
    .map((segmentId) => ({ segmentId, fromPct: pct(before[segmentId]), toPct: pct(after[segmentId]) }))
    .map((c) => ({ ...c, deltaPts: Math.round((c.toPct - c.fromPct) * 10) / 10 }))
    .filter((c) => c.deltaPts !== 0)
    .sort((a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts) || a.segmentId.localeCompare(b.segmentId));
  const top = changed[0];
  if (!top) {
    // A likely sighting counts only once confirmed (the engine's rule), so say where the next step is.
    if (awaitsConfirm(cause)) return { changed: [], banner: CONFIRM_SIGHTING, announce: CONFIRM_SIGHTING };
    return { changed: [], banner: "Report logged. Map unchanged. Ask the team.", announce: "Report logged. Map unchanged." };
  }
  const label = causeLabel(cause);
  const inject = cause.isTrainingInject ? " (training inject)" : "";
  const dir = top.deltaPts > 0 ? "up" : "down";
  return {
    changed,
    banner: `${label}${inject}. ${top.segmentId} ${formatPct(before[top.segmentId] ?? 0)} to ${formatPct(after[top.segmentId] ?? 0)}.`,
    announce: `Segment ${top.segmentId}. POA ${top.toPct.toFixed(1)} percent, ${dir} ${Math.abs(top.deltaPts).toFixed(1)}, after report: ${spoken(label)}.`,
  };
}

/** The chip on a moved segment: signed percentage points to one decimal, ASCII signs only. */
export function deltaLabel(deltaPts: number): string {
  const n = Math.abs(deltaPts);
  return `${deltaPts > 0 ? "+" : "-"}${n.toFixed(1)} ${n === 1 ? "pt" : "pts"}`;
}
