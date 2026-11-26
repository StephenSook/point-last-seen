// A clip's track, incidents/{id}/clipTracks/{sha256}: written once after its read, beside the clip's
// reading (same SHA-256), and read by the incident's members. Its own record, so a track never
// changes the sighting; it is deleted with the reading and the clip (functions/src/media.ts).
// Firestore holds no list inside a list, so each outline is stored as a flat [y, x, y, x, ...] list.

import type { RouteRecord } from "@pls/engine";
import { doc, getDoc, serverTimestamp, setDoc, type FieldValue, type Firestore } from "firebase/firestore";
import type { Box2d, BoxSource, Mask, Track, TrackEntry } from "../extras/timemachine/types";

type StoredEntry = { t: number; box: number[]; source: BoxSource; mask?: number[] };

export type ClipTrackDoc = {
  version: Track["version"];
  sha256: string;
  window: { startS: number; endS: number };
  entries: StoredEntry[];
  model: string;
  route: RouteRecord;
  /** The frames that left the laptop for the box read. */
  framesSent: number;
  createdByUid: string;
  createdAt: FieldValue;
};

export type StoredClipTrack = { track: Track; sha256: string; model: string; route: RouteRecord; framesSent: number; createdAtMs: number };

export function clipTrackDoc(a: { sha256: string; track: Track; model: string; route: RouteRecord; framesSent: number; uid: string }): ClipTrackDoc {
  return {
    version: a.track.version,
    sha256: a.sha256,
    window: { startS: a.track.window.startS, endS: a.track.window.endS },
    entries: a.track.entries.map((e) => ({ t: e.t, box: [...e.box], source: e.source, ...(e.mask ? { mask: e.mask.flatMap(([y, x]) => [y, x]) } : {}) })),
    model: a.model,
    route: a.route,
    framesSent: a.framesSent,
    createdByUid: a.uid,
    createdAt: serverTimestamp(),
  };
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function entryFrom(v: unknown): TrackEntry | null {
  const e = v as Partial<StoredEntry> | null;
  if (!e || !num(e.t) || !Array.isArray(e.box) || e.box.length !== 4 || !e.box.every(num)) return null;
  if (e.source !== "cloud" && e.source !== "on_device") return null;
  const box = e.box as unknown as Box2d;
  if (e.mask === undefined) return { t: e.t, box, source: e.source };
  if (!Array.isArray(e.mask) || e.mask.length < 6 || e.mask.length % 2 !== 0 || !e.mask.every(num)) return null;
  const mask: [number, number][] = [];
  for (let i = 0; i < e.mask.length; i += 2) mask.push([e.mask[i]!, e.mask[i + 1]!]);
  return { t: e.t, box, source: e.source, mask: mask as Mask };
}

/** The stored track, or null when the document is not one this version can show. */
export function clipTrackFromDoc(d: Record<string, unknown>): StoredClipTrack | null {
  if (d["version"] !== "track-v1" || typeof d["sha256"] !== "string" || typeof d["model"] !== "string" || !num(d["framesSent"])) return null;
  const w = d["window"] as { startS?: unknown; endS?: unknown } | null;
  if (!w || !num(w.startS) || !num(w.endS) || !Array.isArray(d["entries"])) return null;
  const entries: TrackEntry[] = [];
  for (const raw of d["entries"] as unknown[]) {
    const e = entryFrom(raw);
    if (!e || (entries.length > 0 && e.t <= entries[entries.length - 1]!.t)) return null;
    entries.push(e);
  }
  const created = d["createdAt"] as { toMillis?: () => number } | null;
  return {
    track: { version: "track-v1", window: { startS: w.startS, endS: w.endS }, entries },
    sha256: d["sha256"],
    model: d["model"],
    route: d["route"] as RouteRecord,
    framesSent: d["framesSent"],
    createdAtMs: typeof created?.toMillis === "function" ? created.toMillis() : 0,
  };
}

const trackRef = (db: Firestore, incidentId: string, sha256: string) => doc(db, "incidents", incidentId, "clipTracks", sha256);

/** Written once: the rules refuse a second write for the same clip. */
export async function writeClipTrack(db: Firestore, incidentId: string, d: ClipTrackDoc): Promise<void> {
  await setDoc(trackRef(db, incidentId, d.sha256), d);
}

export async function findClipTrack(db: Firestore, incidentId: string, sha256: string): Promise<StoredClipTrack | null> {
  const snap = await getDoc(trackRef(db, incidentId, sha256));
  return snap.exists() ? clipTrackFromDoc(snap.data()) : null;
}
