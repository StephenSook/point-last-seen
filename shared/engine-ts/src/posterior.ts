import { compareCodePoints } from "./compare";
import { ioc } from "./ioc";
import type { EngineEvent, EngineParams, PosteriorResult, SegmentPrior } from "./types";

/**
 * w_i = prior_i x product over clears (1 - pod) x product over clues IOC. POA = w / sum(w), ROW included.
 * Events apply in ascending eventId order; a repeated eventId is skipped silently. Clue entries the
 * effect does not list are "neutral". Weights are summed in prior order.
 */
export function posterior(prior: SegmentPrior[], events: EngineEvent[], params: EngineParams): PosteriorResult {
  const ids = prior.map(s => s.segmentId);
  const priorPoa = new Map(prior.map(s => [s.segmentId, s.priorPoa]));
  const w = new Map(priorPoa);
  const notCleared = new Map(ids.map(s => [s, 1]));
  const applied: string[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  const sorted = [...events].sort((a, b) => compareCodePoints(a.eventId, b.eventId));
  for (const e of sorted) {
    if (seen.has(e.eventId)) continue;
    seen.add(e.eventId);
    const eff = e.effect;
    if (eff.kind === "cleared") {
      if (!w.has(eff.segmentId)) { ignored.push(e.eventId); continue; }
      const f = 1 - eff.pod;
      w.set(eff.segmentId, w.get(eff.segmentId)! * f);
      notCleared.set(eff.segmentId, notCleared.get(eff.segmentId)! * f);
      applied.push(e.eventId);
    } else if (eff.kind === "clue") {
      const override = e.iocOverride;
      const listed = override ?? eff.influences;
      if (!Object.keys(listed).some(s => w.has(s))) { ignored.push(e.eventId); continue; }
      for (const s of ids) {
        if (override !== undefined) {
          const f = override[s];
          if (f !== undefined) w.set(s, w.get(s)! * f);
        } else {
          w.set(s, w.get(s)! * ioc(eff.influences[s] ?? "neutral", eff.authenticity, params));
        }
      }
      applied.push(e.eventId);
    } else {
      ignored.push(e.eventId);
    }
  }
  let total = 0;
  for (const s of ids) total = total + w.get(s)!;
  const poa: Record<string, number> = {};
  const remainingMass: Record<string, number> = {};
  const cumulativePod: Record<string, number> = {};
  for (const s of ids) {
    poa[s] = total > 0 ? w.get(s)! / total : 0;
    remainingMass[s] = priorPoa.get(s)! * notCleared.get(s)!;
    cumulativePod[s] = 1 - notCleared.get(s)!;
  }
  return { poa, remainingMass, cumulativePod, appliedEventIds: applied, ignoredEventIds: ignored };
}
