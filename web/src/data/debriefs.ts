// Debriefs (incidents/{id}/debriefs/{segmentId}): after a segment is cleared, how long it took and what worked
// or did not, and, as the team stated it, how much it covered and what clues and hazards it saw. A searcher writes
// one for a segment their own device cleared; command writes one for any segment and edits any. Nothing here feeds
// the map, the probabilities or the plans: a debrief is a note for the team after the search, never a coverage claim
// (a stated coverage is the team's own words, and the engine never reads it).

import { collection, deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { StreamedEvent } from "./events";

export const MAX_MINUTES = 1440;
export const MAX_NOTE = 500;

export type DebriefInput = { tookMinutes: number; worked?: string; didNotWork?: string; coverageStatedPct?: number; clues?: string; hazards?: string };
export type Debrief = DebriefInput & { segmentId: string; byUid: string; createdAtMs: number | null; clearedEventId: string | null };
export type ClearedSegment = { segmentId: string; eventId: string; deviceId: string; teamId: string | null };

const MINUTES_LINE = `Time it took: a whole number of minutes, 0 to ${MAX_MINUTES}.`;
const COVERAGE_LINE = "Coverage stated: a whole number from 0 to 100, or empty.";

export type DebriefForm = { minutes: string; worked: string; didNotWork: string; coverage: string; clues: string; hazards: string };

/** The form's boxes as a debrief, or the one thing to fix. Coverage, clues and hazards are optional. */
export function parseDebriefForm(f: DebriefForm): { ok: true; value: DebriefInput } | { ok: false; message: string } {
  const m = f.minutes.trim();
  if (!/^\d+$/.test(m) || Number(m) > MAX_MINUTES) return { ok: false, message: MINUTES_LINE };
  const worked = f.worked.trim();
  const didNotWork = f.didNotWork.trim();
  if (worked.length > MAX_NOTE) return { ok: false, message: `What worked: ${MAX_NOTE} characters at most.` };
  if (didNotWork.length > MAX_NOTE) return { ok: false, message: `What didn't work: ${MAX_NOTE} characters at most.` };
  const c = f.coverage.trim();
  if (c !== "" && (!/^\d+$/.test(c) || Number(c) > 100)) return { ok: false, message: COVERAGE_LINE };
  const clues = f.clues.trim();
  const hazards = f.hazards.trim();
  if (clues.length > MAX_NOTE) return { ok: false, message: `Clues: ${MAX_NOTE} characters at most.` };
  if (hazards.length > MAX_NOTE) return { ok: false, message: `Hazards: ${MAX_NOTE} characters at most.` };
  return {
    ok: true,
    value: {
      tookMinutes: Number(m),
      ...(worked ? { worked } : {}),
      ...(didNotWork ? { didNotWork } : {}),
      ...(c !== "" ? { coverageStatedPct: Number(c) } : {}),
      ...(clues ? { clues } : {}),
      ...(hazards ? { hazards } : {}),
    },
  };
}

const text = (v: unknown) => (typeof v === "string" ? v : undefined);
/** A stored stated coverage only when it is a whole percent from 0 to 100, as the rules hold. */
const statedPct = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : undefined);

/** A stored debrief, or null when the document is not one this app can trust. */
export function debriefFromDoc(segmentId: string, data: unknown): Debrief | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const minutes = d["tookMinutes"];
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || typeof d["byUid"] !== "string") return null;
  const created = d["createdAt"] as { toMillis?: () => number } | undefined;
  return {
    segmentId,
    tookMinutes: minutes,
    worked: text(d["worked"]),
    didNotWork: text(d["didNotWork"]),
    coverageStatedPct: statedPct(d["coverageStatedPct"]),
    clues: text(d["clues"]),
    hazards: text(d["hazards"]),
    byUid: d["byUid"] as string,
    createdAtMs: typeof created?.toMillis === "function" ? created.toMillis() : null,
    clearedEventId: typeof d["clearedEventId"] === "string" ? (d["clearedEventId"] as string) : null,
  };
}

/** A new debrief: the writer, the server's time and, when known, the cleared event it belongs to. */
export function newDebriefDoc(input: DebriefInput, uid: string, clearedEventId: string | null): object {
  return { ...input, byUid: uid, createdAt: serverTimestamp(), clearedEventId };
}

/** An edit: the time and the notes only (the writer, the time and the event stay); a cleared note is removed. */
export function debriefEdit(input: DebriefInput): object {
  return {
    tookMinutes: input.tookMinutes,
    worked: input.worked ?? deleteField(),
    didNotWork: input.didNotWork ?? deleteField(),
    coverageStatedPct: input.coverageStatedPct ?? deleteField(),
    clues: input.clues ?? deleteField(),
    hazards: input.hazards ?? deleteField(),
  };
}

/** Each segment a searcher cleared, once, with its latest clear. */
export function clearedSegments(events: readonly StreamedEvent[]): ClearedSegment[] {
  const latest = new Map<string, { c: ClearedSegment; t: number }>();
  for (const e of events) {
    const effect = e["effect"] as { kind?: unknown; segmentId?: unknown } | undefined;
    if (e["type"] !== "cleared" || effect?.kind !== "cleared" || typeof effect.segmentId !== "string") continue;
    const t = e.serverTimeMs ?? Number.MAX_SAFE_INTEGER;
    const prev = latest.get(effect.segmentId);
    if (prev && prev.t > t) continue;
    latest.set(effect.segmentId, {
      t,
      c: { segmentId: effect.segmentId, eventId: e.eventId, deviceId: String(e["deviceId"] ?? ""), teamId: typeof e["teamId"] === "string" ? (e["teamId"] as string) : null },
    });
  }
  return [...latest.values()].map((x) => x.c).sort((a, b) => a.segmentId.localeCompare(b.segmentId));
}

/** Who wrote it: the clearing team when its own device did, else command. */
export function debriefAuthor(d: Pick<Debrief, "byUid">, cleared: ClearedSegment | undefined, teams: readonly { teamId: string; name: string }[]): string {
  if (!cleared || d.byUid !== cleared.deviceId) return "Command";
  return teams.find((t) => t.teamId === cleared.teamId)?.name ?? "The clearing team";
}

export function subscribeDebriefs(db: Firestore, incidentId: string, cb: (d: Record<string, Debrief>) => void, onError: (e: unknown) => void): Unsubscribe {
  return onSnapshot(collection(db, "incidents", incidentId, "debriefs"), (s) => {
    const out: Record<string, Debrief> = {};
    for (const d of s.docs) {
      const v = debriefFromDoc(d.id, d.data());
      if (v) out[d.id] = v;
    }
    cb(out);
  }, onError);
}

/** Creates the debrief, or edits it when one exists. */
export async function saveDebrief(db: Firestore, incidentId: string, segmentId: string, input: DebriefInput, existing: boolean, uid: string, clearedEventId: string | null): Promise<void> {
  const ref = doc(db, "incidents", incidentId, "debriefs", segmentId);
  if (existing) await updateDoc(ref, debriefEdit(input) as Record<string, unknown>);
  else await setDoc(ref, newDebriefDoc(input, uid, clearedEventId));
}
