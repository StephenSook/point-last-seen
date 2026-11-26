// The clip's track: a box around the walking person for each second of the flagged window, read in
// the cloud from frames this laptop takes from the clip (one JPEG per second), after the sighting
// read. It is its own read and its own record: a track that breaks a rule is dropped whole, and the
// sighting never changes. The outlines are a second, optional read: one that fails leaves the boxes.
// The format is the one the spike measured (docs/evidence/web/2026-11-26-clip-track-frames-spike.json).

import type { RouteRecord } from "@pls/engine";
import { InferenceMode, type HybridParams, type Part } from "firebase/ai";
import type { StoredClipReading } from "../data/clips";
import type { Box2d, ClipTrackVersion, Mask, Track, TrackEntry } from "../extras/timemachine/types";
import type { ClipWindow } from "./clipRead";
import { CONSENT_GONE, CONSENT_UNCONFIRMED, MEDIA_DELETED, PAUSED, parseCameraSighting } from "./clipRead";

export const CLIP_TRACK_VERSION: ClipTrackVersion = "track-v1";
/** Frames are sent at this many pixels on their long side (about 1,100 input tokens each at 960 x 540). */
export const TRACK_FRAME_MAX_SIDE = 960;
/** About 51 reply tokens a boxed frame were measured, so 40 frames fit one 2048-token reply. */
export const TRACK_BOX_FRAMES_PER_CALL = 40;
/** About 260 to 330 reply tokens an outlined frame, so 6 fit one reply. */
export const TRACK_MASK_FRAMES_PER_CALL = 6;
export const TRACK_MAX_OUTPUT_TOKENS = 2048;

const BOX = { type: ["array", "null"], items: { type: "integer" }, description: "[ymin, xmin, ymax, xmax] normalized to 0-1000, or null when no person is in the frame" };
const MASK = { type: ["array", "null"], items: { type: "array", items: { type: "integer" } }, description: "a polygon outlining the person: up to 16 [y, x] points normalized to 0-1000, or null" };

/**
 * No bounds, patterns or item caps in the schema: those made the serving side refuse it ("too many states");
 * the code below checks them instead.
 */
export const TRACK_JSON = {
  type: "object",
  properties: { track: { type: "array", items: { type: "object", properties: { t: { type: "integer" }, label: { type: "string" }, box_2d: BOX }, required: ["t", "label", "box_2d"] } } },
  required: ["track"],
} as const;

export const MASK_JSON = {
  type: "object",
  properties: { track: { type: "array", items: { type: "object", properties: { t: { type: "integer" }, label: { type: "string" }, box_2d: BOX, mask: MASK }, required: ["t", "label", "box_2d", "mask"] } } },
  required: ["track"],
} as const;

/**
 * Cloud only. No thinking level is set: the clip model's default is already the lowest (Firebase's thinking table),
 * and the faster Flash models refuse that level outright, so naming it could only break a change of model.
 */
export function clipTrackParams(model: string, withMask: boolean): HybridParams {
  return {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model, generationConfig: { responseMimeType: "application/json", responseJsonSchema: withMask ? MASK_JSON : TRACK_JSON, maxOutputTokens: TRACK_MAX_OUTPUT_TOKENS } },
  };
}

const INSTRUCTION =
  "These are frames from a short home-camera clip from a training drill, one per second, each after its t. " +
  "Detect the walking person in each frame. The box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000. " +
  'Give one entry per frame with its t and the label "person". Use null for box_2d when no person is in that frame. ';
const MASK_ASK = "Also give mask: a polygon outlining the person, up to 16 [y, x] points normalized to 0-1000, or null. ";
const LIMITS = "Do not describe the face. Do not guess who the person is.";

/**
 * The frames to send: one at each whole second of the window, then the clip's last frame when it lies more than
 * half a second past the last whole second (labelled with its rounded second), so the track reaches the clip's end.
 */
export function trackFrameTimes(window: ClipWindow, durationS: number, frameS: number): { t: number; atS: number }[] {
  const end = Math.min(window.endS, durationS);
  const out: { t: number; atS: number }[] = [];
  for (let t = Math.max(0, Math.ceil(window.startS)); t < end; t++) out.push({ t, atS: t });
  const lastAtS = end - frameS;
  const lastT = out.at(-1)?.t ?? Number.NEGATIVE_INFINITY;
  // Its label must stay inside the window (from its first whole second to its end), or the frame is left out.
  const label = Math.round(lastAtS);
  if (lastAtS > lastT + 0.5 && label >= Math.max(0, Math.ceil(window.startS)) && label <= end) out.push({ t: label, atS: lastAtS });
  return out;
}

/** The instruction first, then "t=<second>" before each frame. */
export function trackParts(frames: readonly { t: number; jpeg: string }[], withMask: boolean): Part[] {
  const parts: Part[] = [{ type: "text", text: INSTRUCTION + (withMask ? MASK_ASK : "") + LIMITS }];
  for (const f of frames) {
    parts.push({ type: "text", text: `t=${f.t}` });
    parts.push({ type: "inlineData", inlineData: { mimeType: "image/jpeg", data: f.jpeg } });
  }
  return parts;
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const scaled = (v: unknown): v is number => int(v) && v >= 0 && v <= 1000;

function asBox(v: unknown): Box2d | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 4 || !v.every(scaled)) return undefined;
  const [y0, x0, y1, x1] = v as number[];
  return y0! < y1! && x0! < x1! ? [y0!, x0!, y1!, x1!] : undefined;
}

function entries(text: string, sent: readonly number[]): Record<string, unknown>[] | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const track = (v as { track?: unknown } | null)?.track;
  // Exactly one entry per frame sent (a null box says nobody is in that frame), in the order they were sent.
  if (!Array.isArray(track) || track.length !== sent.length) return null;
  const allowed = new Set(sent);
  let last = Number.NEGATIVE_INFINITY;
  for (const e of track as Record<string, unknown>[]) {
    if (!e || typeof e !== "object" || !int(e["t"]) || !allowed.has(e["t"]) || e["t"] <= last) return null;
    last = e["t"];
  }
  return track as Record<string, unknown>[];
}

const isPerson = (label: unknown) => typeof label === "string" && label.trim().toLowerCase() === "person";

/**
 * The boxes in a reply, one per second with a person, or null when the reply breaks any rule: not JSON, more
 * entries than frames, a time that was not sent, times not strictly increasing, or a box that is not 4 integers
 * on 0 to 1000 with its corners in order. A box labelled as anything but a person is left out.
 */
export function parseTrackReply(text: string, sent: readonly number[]): TrackEntry[] | null {
  const list = entries(text, sent);
  if (!list) return null;
  const out: TrackEntry[] = [];
  for (const e of list) {
    const box = asBox(e["box_2d"]);
    if (box === undefined) return null;
    if (box && isPerson(e["label"])) out.push({ t: e["t"] as number, box, source: "cloud" });
  }
  return out;
}

/** The outlines in a mask reply, by second: at least 3 [y, x] points on 0 to 1000. A bad outline is left out; a reply that is not usable gives null. */
export function parseMaskReply(text: string, sent: readonly number[]): Map<number, Mask> | null {
  const list = entries(text, sent);
  if (!list) return null;
  const out = new Map<number, Mask>();
  for (const e of list) {
    const m = e["mask"];
    if (!Array.isArray(m) || m.length < 3 || !isPerson(e["label"])) continue;
    if (!m.every((p) => Array.isArray(p) && p.length === 2 && scaled(p[0]) && scaled(p[1]))) continue;
    out.set(e["t"] as number, (m as [number, number][]).map(([y, x]) => [y, x] as const));
  }
  return out;
}

export const NO_READING = "This clip has no reading yet. Nothing was sent.";

/** A refusal after frames left: the reason, then how many frames had already been sent (never "Nothing was sent."). */
export function stoppedMessage(reason: string, framesSent: number): string {
  const why = reason.replace(/ ?Nothing was sent\.$/, "");
  return `${why} The read stopped. ${framesSent} frame${framesSent === 1 ? "" : "s"} of the clip had already been sent to the cloud.`;
}

/** A finished reading: a sighting the parser accepts, or a no-sighting. */
function completedReading(r: StoredClipReading["reading"]): boolean {
  if (r == null) return false;
  if ((r as { status?: unknown }).status === "no_sighting") return true;
  return parseCameraSighting(JSON.stringify(r)) !== null;
}

export type TrackReply = { text: string; finishReason?: string | null; inferenceSource?: string };

export type TrackReadRequest = {
  sha256: string;
  model: string;
  /** The clip's exact length in seconds (the video element's duration), for its last frame. */
  durationS: number;
  /** The flagged window the sighting read covered; the whole clip when triage did not run. */
  window: ClipWindow;
  /** Seconds per video frame (1/30 when not known). */
  frameS: number;
  /** Read live (Remote Config): checked before every call. */
  killCloud: () => boolean;
  /** False once this search's media was deleted after the read began. */
  stillCurrent?: () => boolean;
  /** Whether to ask for outlines too, after the boxes. */
  withMasks: boolean;
};

export type TrackReadDeps = {
  /** The clip's record, read from the server only (never a cache); throws when the server cannot be reached. */
  confirmReading: (sha256: string) => Promise<StoredClipReading | null>;
  /** One frame of the clip as a JPEG (base64), taken on this laptop. */
  frameJpeg: (atS: number) => Promise<string>;
  boxes: (parts: Part[]) => Promise<TrackReply>;
  masks: (parts: Part[]) => Promise<TrackReply>;
  nowMs: () => number;
};

export type TrackReadOutcome =
  | { kind: "refused"; message: string }
  /** max_tokens: a box reply stopped at its token cap; invalid: a box reply broke a rule; error: the call failed (`status` when the SDK gave one). */
  | { kind: "failed"; reason: "max_tokens" | "invalid" | "error"; status?: number }
  /** framesSent: the frames that left this laptop for the box read (the outline read sends some of them again). */
  | { kind: "read"; track: Track; framesSent: number; maskFramesSent: number; route: RouteRecord };

function chunks<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Reads the track of a clip whose sighting was already read: the clip's three consents are confirmed from the
 * server first, the cloud pause is read before every call, and a delete since the read began discards the reply.
 */
export async function readClipTrack(r: TrackReadRequest, deps: TrackReadDeps): Promise<TrackReadOutcome> {
  // Distinct frames that have left in a box call; every refusal after the first call says how many.
  let sent = 0;
  const stop = (message: string): TrackReadOutcome => ({ kind: "refused", message: sent === 0 ? message : stoppedMessage(message, sent) });
  const deleted = () => !!r.stillCurrent && !r.stillCurrent();
  const halt = (): string | null => (deleted() ? MEDIA_DELETED : r.killCloud() ? PAUSED : null);
  // The clip's record from the server, read again before every call and after the last reply: it must still hold
  // the three consents, not have expired, and carry the clip's finished reading (a track never comes before its sighting).
  const gate = async (): Promise<{ record: StoredClipReading } | { stop: string }> => {
    let record: StoredClipReading | null;
    try {
      record = await deps.confirmReading(r.sha256);
    } catch {
      return { stop: CONSENT_UNCONFIRMED };
    }
    const c = record?.consent;
    if (!record || !(record.expiresAtMs > deps.nowMs()) || !c?.personInClip || !c.footageOwner || !c.cloudProcessing) return { stop: CONSENT_GONE };
    if (!completedReading(record.reading)) return { stop: NO_READING };
    return { record };
  };
  const checked = async (): Promise<string | null> => {
    const h = halt();
    if (h) return h;
    const ok = await gate();
    return "stop" in ok ? ok.stop : halt();
  };

  const h0 = halt();
  if (h0) return stop(h0);
  const first = await gate();
  if ("stop" in first) return stop(first.stop);
  // The record keeps no window, so the caller's window is held to the stored clip's length (whole seconds, plus one).
  const window = { startS: r.window.startS, endS: Math.min(r.window.endS, r.durationS, first.record.durationS + 1) };

  try {
    const times = trackFrameTimes(window, r.durationS, r.frameS);
    if (times.length === 0) return { kind: "failed", reason: "invalid" };
    const frames: { t: number; jpeg: string }[] = [];
    for (const f of times) frames.push({ t: f.t, jpeg: await deps.frameJpeg(f.atS) });

    const t0 = deps.nowMs();
    const boxed: TrackEntry[] = [];
    let reported = true;
    let onDevice = false;
    for (const part of chunks(frames, TRACK_BOX_FRAMES_PER_CALL)) {
      const why = await checked();
      if (why) return stop(why);
      sent += part.length;
      const reply = await deps.boxes(trackParts(part, false));
      if (deleted()) return stop(MEDIA_DELETED);
      reported &&= reply.inferenceSource !== undefined;
      onDevice ||= reply.inferenceSource === "on_device";
      if (reply.finishReason === "MAX_TOKENS") return { kind: "failed", reason: "max_tokens" };
      const got = parseTrackReply(reply.text, part.map((f) => f.t));
      if (!got) return { kind: "failed", reason: "invalid" };
      boxed.push(...got);
    }
    const t1 = deps.nowMs();

    // Outlines: only frames that got a box, a few at a time; a failed call drops only its own outlines.
    const masks = new Map<number, Mask>();
    let maskFramesSent = 0;
    if (r.withMasks) {
      const has = new Set(boxed.map((e) => e.t));
      for (const part of chunks(frames.filter((f) => has.has(f.t)), TRACK_MASK_FRAMES_PER_CALL)) {
        const why = await checked();
        if (why) return stop(why);
        try {
          maskFramesSent += part.length;
          const reply = await deps.masks(trackParts(part, true));
          if (deleted()) return stop(MEDIA_DELETED);
          if (reply.finishReason === "MAX_TOKENS") continue;
          for (const [t, m] of parseMaskReply(reply.text, part.map((f) => f.t)) ?? []) masks.set(t, m);
        } catch {
          // The boxes stand without these outlines.
        }
      }
    }
    // Once more before anything is handed back.
    const last = halt();
    if (last) return stop(last);
    const track: Track = {
      version: CLIP_TRACK_VERSION,
      window: { startS: window.startS, endS: Math.min(window.endS, r.durationS) },
      entries: boxed.map((e) => (masks.has(e.t) ? { ...e, mask: masks.get(e.t)! } : e)),
    };
    const route: RouteRecord = {
      platform: "web", path: onDevice ? "on_device" : "cloud", stage: "sdk", model: r.model, reason: "sdk_only_in_cloud",
      latencyMs: t1 - t0, sdkReported: reported, blocked: null, decidedAtMs: t1,
    };
    return { kind: "read", track, framesSent: frames.length, maskFramesSent, route };
  } catch (e) {
    // Only the status number leaves this function: no raw error text reaches the page.
    const status = (e as { customErrorData?: { status?: unknown } } | null)?.customErrorData?.status;
    return typeof status === "number" ? { kind: "failed", reason: "error", status } : { kind: "failed", reason: "error" };
  }
}
