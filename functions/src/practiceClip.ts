// The practice clip a judge's practice search gets from its seed. Only a clip listed by SHA-256 (the blurred copy of
// the team's porch clip) whose seed reading carries the "public use, film or judge page" consent, with that reading
// and its track copied field by field into a fixed schema: no field the schema does not name, no seed account id. The
// file's bytes are hashed before they are written to the practice search, under fresh metadata (no download token).

import { createHash } from "node:crypto";
import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";

/** Who the copied records name instead of the seed's own accounts. */
export const PRACTICE_SEED_UID = "practice-seed";
/** The Storage rules' upload cap for a clip. */
export const CLIP_MAX_BYTES = 14_000_000;
/** A track has at most this many entries and frames (the rules' cap: two minutes at one a second). */
const TRACK_MAX = 121;

/** The camera sighting schema's closed lists (shared/schemas/camera-sighting.schema.json; a test keeps them equal). */
export const SIGHTING_ENUMS = {
  edge: ["left", "right", "top", "bottom", "toward_camera", "away_from_camera", "unknown"],
  color: ["black", "white", "gray", "brown", "tan", "red", "orange", "yellow", "green", "blue", "purple", "pink", "unknown"],
  lighting: ["day", "night_ir", "low_light", "unknown"],
  legibility: ["clear", "partial", "poor"],
} as const;

const MMSS = /^[0-9]{2}:[0-5][0-9]$/;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const oneOf = (v: unknown, list: readonly string[]): v is string => typeof v === "string" && list.includes(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const scaled = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000;
const ordered = (b: unknown): b is number[] => {
  if (!Array.isArray(b) || b.length !== 4 || !b.every(scaled)) return false;
  const [y0, x0, y1, x1] = b as [number, number, number, number];
  return y0 < y1 && x0 < x1;
};

/** A camera sighting reading, rebuilt from the schema's own fields, or null when any field breaks the schema. */
export function practiceSighting(v: unknown): Record<string, unknown> | null {
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const k = r["keyFrame"] as Record<string, unknown> | null;
  const carried = r["carriedItems"];
  const ok = typeof r["personVisible"] === "boolean" && text(r["firstSeen"], 5) && MMSS.test(r["firstSeen"] as string)
    && text(r["lastSeen"], 5) && MMSS.test(r["lastSeen"] as string)
    && oneOf(r["entryEdge"], SIGHTING_ENUMS.edge) && oneOf(r["exitEdge"], SIGHTING_ENUMS.edge)
    && oneOf(r["topColor"], SIGHTING_ENUMS.color) && oneOf(r["bottomColor"], SIGHTING_ENUMS.color)
    && text(r["topType"], 40) && text(r["footwear"], 40) && text(r["headwear"], 40)
    && Array.isArray(carried) && carried.length <= 3 && carried.every((c) => text(c, 40))
    && !!k && typeof k === "object" && text(k["time"], 5) && MMSS.test(k["time"] as string) && ordered(k["box2d"])
    && oneOf(r["lighting"], SIGHTING_ENUMS.lighting) && oneOf(r["legibility"], SIGHTING_ENUMS.legibility) && text(r["evidence"], 400);
  if (!ok) return null;
  return {
    personVisible: r["personVisible"], firstSeen: r["firstSeen"], lastSeen: r["lastSeen"], entryEdge: r["entryEdge"], exitEdge: r["exitEdge"],
    topColor: r["topColor"], bottomColor: r["bottomColor"], topType: r["topType"], footwear: r["footwear"], headwear: r["headwear"],
    carriedItems: [...(carried as string[])], keyFrame: { time: k!["time"], box2d: [...(k!["box2d"] as number[])] },
    lighting: r["lighting"], legibility: r["legibility"], evidence: r["evidence"],
  };
}

/** A route record (shared/schemas/route-record.schema.json), rebuilt from its nine fields, or null. */
function practiceRoute(v: unknown): Record<string, unknown> | null {
  const m = v as Record<string, unknown> | null;
  if (!m || typeof m !== "object") return null;
  const ok = text(m["platform"], 7) && text(m["path"], 9) && text(m["stage"], 20) && text(m["model"], 80) && text(m["reason"], 26)
    && num(m["latencyMs"]) && (m["latencyMs"] as number) >= 0 && typeof m["sdkReported"] === "boolean"
    && (m["blocked"] === null || text(m["blocked"], 9)) && num(m["decidedAtMs"]);
  if (!ok) return null;
  return { platform: m["platform"], path: m["path"], stage: m["stage"], model: m["model"], reason: m["reason"],
    latencyMs: m["latencyMs"], sdkReported: m["sdkReported"], blocked: m["blocked"], decidedAtMs: m["decidedAtMs"] };
}

/** A consent mark kept as when it was given, not whose account gave it; null when it was not given. */
const practiceMark = (m: unknown) => {
  const x = m as { byUid?: unknown; atMs?: unknown } | null;
  return x && typeof x.byUid === "string" && num(x.atMs) ? { byUid: PRACTICE_SEED_UID, atMs: x.atMs } : null;
};
const FACINGS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The practice search's copy of the seed's clip reading, or null when it must not be copied: the reading is not a
 * valid sighting, a required consent or the judge-page consent (publicUse) is missing, or the consent has expired.
 * The copy ends with the practice search when that comes first.
 */
export function practiceReading(d: DocumentData, sha256: string, storagePath: string, attemptEnds: unknown, nowMs: number): DocumentData | null {
  const c = (d["consent"] ?? {}) as Record<string, unknown>;
  const consent = { personInClip: practiceMark(c["personInClip"]), footageOwner: practiceMark(c["footageOwner"]),
    cloudProcessing: practiceMark(c["cloudProcessing"]), publicUse: practiceMark(c["publicUse"]) };
  const seedEnds = d["expiresAt"];
  const reading = practiceSighting(d["reading"]);
  const route = d["route"] === null ? null : practiceRoute(d["route"]);
  const facing = d["cameraFacingDeg"];
  const ok = d["sha256"] === sha256 && reading !== null && (d["route"] === null || route !== null)
    && consent.personInClip && consent.footageOwner && consent.cloudProcessing && consent.publicUse
    && seedEnds instanceof Timestamp && seedEnds.toMillis() > nowMs && d["createdAt"] instanceof Timestamp
    && num(d["durationS"]) && d["durationS"] > 0 && d["durationS"] <= 600 && num(d["clipStartMs"]) && typeof d["clockConfirmed"] === "boolean"
    && (facing === null || FACINGS.includes(facing as number));
  if (!ok) return null;
  const ends = attemptEnds instanceof Timestamp && attemptEnds.toMillis() < seedEnds.toMillis() ? attemptEnds : seedEnds;
  return { sha256, storagePath, durationS: d["durationS"], clipStartMs: d["clipStartMs"], clockConfirmed: d["clockConfirmed"],
    cameraFacingDeg: facing, reading, route, consent, expiresAt: ends, createdAt: d["createdAt"], createdByUid: PRACTICE_SEED_UID };
}

/**
 * One track entry rebuilt from its own fields (t, box, source, an optional flat outline), or null. An outline over 16
 * points (32 numbers) is dropped and the entry kept, as the writer and the reader do.
 */
function practiceEntry(v: unknown): Record<string, unknown> | null {
  const e = v as Record<string, unknown> | null;
  if (!e || typeof e !== "object" || !Number.isInteger(e["t"]) || (e["t"] as number) < 0 || !ordered(e["box"])) return null;
  if (e["source"] !== "cloud" && e["source"] !== "on_device") return null;
  const mask = e["mask"];
  if (mask === undefined || (Array.isArray(mask) && mask.length > 32)) return { t: e["t"], box: [...(e["box"] as number[])], source: e["source"] };
  if (!Array.isArray(mask) || mask.length < 6 || mask.length % 2 !== 0 || !mask.every(scaled)) return null;
  return { t: e["t"], box: [...(e["box"] as number[])], source: e["source"], mask: [...mask] };
}

/** The practice search's copy of the seed's track, or null when any field breaks the track's schema. */
export function practiceTrack(d: DocumentData, sha256: string): DocumentData | null {
  const w = d["window"] as Record<string, unknown> | null;
  const raw = d["entries"];
  const entries = Array.isArray(raw) && raw.length <= TRACK_MAX ? raw.map(practiceEntry) : null;
  const route = practiceRoute(d["route"]);
  const ok = d["version"] === "track-v1" && d["sha256"] === sha256 && !!w && num(w["startS"]) && num(w["endS"]) && w["startS"] >= 0 && w["endS"] > w["startS"]
    && entries !== null && entries.every((e) => e !== null) && text(d["model"], 64) && (d["model"] as string).length > 0 && route !== null
    && Number.isInteger(d["framesSent"]) && d["framesSent"] >= 1 && d["framesSent"] <= TRACK_MAX && d["createdAt"] instanceof Timestamp;
  if (!ok) return null;
  return { version: "track-v1", sha256, window: { startS: w!["startS"], endS: w!["endS"] }, entries, model: d["model"], route,
    framesSent: d["framesSent"], createdAt: d["createdAt"], createdByUid: PRACTICE_SEED_UID };
}

/** Where a practice clip's file is copied, and removed again when its records could not be written. */
export type ClipStore = {
  /** Copies the file only when its bytes hash to `sha256`; rejects otherwise. */
  copy(fromPath: string, toPath: string, sha256: string): Promise<void>;
  remove(path: string): Promise<void>;
};

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

/**
 * The production store. The source's bytes are read and hashed (at most CLIP_MAX_BYTES), then those same bytes are
 * written to the practice search under fresh metadata: no download token or custom metadata carries over.
 */
export function bucketClipStore(bucket: Bucket): ClipStore {
  return {
    async copy(fromPath, toPath, sha256) {
      const source = bucket.file(fromPath);
      const [meta] = await source.getMetadata();
      if (!(Number(meta.size) > 0 && Number(meta.size) <= CLIP_MAX_BYTES)) throw new Error("practice clip size");
      const [bytes] = await source.download();
      if (bytes.length !== Number(meta.size) || createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("practice clip bytes");
      await bucket.file(toPath).save(bytes, { resumable: false, contentType: "video/mp4", metadata: { contentType: "video/mp4" } });
    },
    async remove(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}
