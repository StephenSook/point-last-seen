// A report's "Going" direction as a compass bearing: the eight compass points only. Upstream, downstream and
// unknown give no bearing (the wedge needs one).

import type { ReportReading } from "@pls/engine";

const COMPASS_DEG: Partial<Record<ReportReading["direction"], number>> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };

/** The compass bearing an event's reading says the person went, or null. */
export function readingBearingDeg(e: { reading?: unknown }): number | null {
  const r = e.reading && typeof e.reading === "object" && "direction" in e.reading ? (e.reading as { direction: ReportReading["direction"] }) : null;
  return r ? (COMPASS_DEG[r.direction] ?? null) : null;
}
