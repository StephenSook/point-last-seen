// The camera clip read (spec section 12.1): one staged clip, sent inline to the cloud model
// only after its three required consents, read into the shared CameraSighting shape. Code,
// not the model, decides the bearing and the last-seen time.

import { InferenceMode, type HybridParams, type Part } from "firebase/ai";
import { bearingFromExit, checkSighting, consentComplete, sizeProblem, type CameraSightingInput, type ClipConsent, type ClipNoSighting, type ClipNoSightingReason, type RouteReason, type RouteRecord } from "@pls/engine";
import clipSchema from "../../../shared/schemas/camera-sighting.schema.json";
import { consentRecord, takeOverConsent, type ClipRecordDoc, type StoredClipReading } from "../data/clips";
import { bytesToBase64, sha256Hex } from "../data/photos";
import { CLOUD_MAX_OUTPUT_TOKENS } from "./limits";

const P = clipSchema.properties;
const mmss = (description: string) => ({ type: "string", pattern: P.firstSeen.pattern, description }) as const;

/** The shared CameraSighting schema as the model's response schema (closed lists and caps from the shared file). */
export const CAMERA_SIGHTING_JSON = {
  type: "object",
  properties: {
    personVisible: { type: "boolean" },
    firstSeen: mmss("MM:SS from the clip start when the person first appears"),
    lastSeen: mmss("MM:SS from the clip start when the person is last visible"),
    entryEdge: { type: "string", enum: P.entryEdge.enum },
    exitEdge: { type: "string", enum: P.exitEdge.enum, description: "the frame edge they leave by, or the direction they walk" },
    topColor: { type: "string", enum: P.topColor.enum },
    bottomColor: { type: "string", enum: P.bottomColor.enum },
    topType: { type: "string", maxLength: P.topType.maxLength },
    footwear: { type: "string", maxLength: P.footwear.maxLength },
    headwear: { type: "string", maxLength: P.headwear.maxLength },
    carriedItems: { type: "array", maxItems: P.carriedItems.maxItems, items: { type: "string" } },
    keyFrame: {
      type: "object",
      properties: {
        time: mmss("MM:SS of the clearest frame"),
        box2d: { type: "array", minItems: 4, maxItems: 4, items: { type: "integer", minimum: 0, maximum: 1000 }, description: "[yMin, xMin, yMax, xMax] on a 0 to 1000 scale" },
      },
      required: P.keyFrame.required,
    },
    lighting: { type: "string", enum: P.lighting.enum },
    legibility: { type: "string", enum: P.legibility.enum },
    evidence: { type: "string", maxLength: P.evidence.maxLength, description: "one sentence on what is visible" },
  },
  required: clipSchema.required,
} as const;

/** The same instruction the Android family app sends with a clip. */
export const CLIP_PROMPT =
  "This is a short home-camera clip from a training drill. Describe one adult walking through the view: " +
  "when they first and last appear, which frame edge they enter and leave by (toward_camera or " +
  "away_from_camera when they walk along the view), their clothing colors from the closed list, " +
  "what they carry, the clearest frame with a box around the person, the lighting, and how legible the clip is. " +
  "Do not describe the face. Do not guess who the person is. Use unknown when you cannot tell.";

/** Cloud only (ONLY_IN_CLOUD): a clip is never read on this laptop's model. */
export function clipCloudParams(model: string): HybridParams {
  return {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: CAMERA_SIGHTING_JSON, maxOutputTokens: CLOUD_MAX_OUTPUT_TOKENS },
    },
  };
}

/** A span of the clip in seconds from its start (on-device triage's flagged seconds). */
export type ClipWindow = { startS: number; endS: number };

/**
 * The request: the clip inline with its own type, then the prompt. With a window the model reads
 * only those seconds (videoMetadata); its times stay counted from the clip's start (measured
 * once: docs/evidence/web/2026-11-18-video-offsets.json).
 */
export function clipParts(base64: string, mimeType: string, window?: ClipWindow): Part[] {
  const video: Part = { type: "inlineData", inlineData: { mimeType, data: base64 } };
  if (window) video.videoMetadata = { startOffset: `${window.startS}s`, endOffset: `${window.endS}s` };
  return [video, { type: "text", text: CLIP_PROMPT }];
}

export const NEEDS_CONSENT = "Three consents are needed for this clip: the person in the clip, the owner of the footage, and cloud processing.";
export const PAUSED = "Clip reading is paused right now.";
export const CONSENT_GONE = "The consent record for this clip was deleted. Nothing was sent.";
export const CONSENT_UNCONFIRMED = "Could not confirm this clip's consent with the server. Nothing was sent.";
export const MEDIA_DELETED = "This search's clips and photos were deleted. Nothing was sent.";
export const NO_LENGTH = "The clip's length could not be read. Try another copy of the clip.";

const EDGES: readonly string[] = P.exitEdge.enum;
const LIGHTING: readonly string[] = P.lighting.enum;
const LEGIBILITY: readonly string[] = P.legibility.enum;
const str = (v: unknown): v is string => typeof v === "string";

/**
 * The model's reply in the shared shape, or null. Edges, lighting and legibility must be on
 * their closed lists (the bearing table has no row for anything else); colors and lengths are
 * left to checkSighting, which normalizes them.
 */
export function parseCameraSighting(text: string): CameraSightingInput | null {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const k = v["keyFrame"] as Record<string, unknown> | undefined;
  const box = k?.["box2d"];
  const ok =
    typeof v["personVisible"] === "boolean" && str(v["firstSeen"]) && str(v["lastSeen"]) &&
    EDGES.includes(v["entryEdge"] as string) && EDGES.includes(v["exitEdge"] as string) &&
    str(v["topColor"]) && str(v["bottomColor"]) && str(v["topType"]) && str(v["footwear"]) && str(v["headwear"]) &&
    Array.isArray(v["carriedItems"]) && (v["carriedItems"] as unknown[]).every(str) &&
    !!k && str(k["time"]) && Array.isArray(box) && box.every((n) => typeof n === "number") &&
    LIGHTING.includes(v["lighting"] as string) && LEGIBILITY.includes(v["legibility"] as string) && str(v["evidence"]);
  return ok ? (v as unknown as CameraSightingInput) : null;
}

export type ClipReadRequest = {
  incidentId: string;
  bytes: Uint8Array;
  mimeType: string;
  /** Whole seconds, from the video element; 0 when it could not be read. */
  durationS: number;
  clipStartMs: number;
  clockConfirmed: boolean;
  cameraFacingDeg: number | null;
  consent: ClipConsent;
  /** Read live (Remote Config): checked before the read, before the upload and before the model call. */
  killCloud: () => boolean;
  model: string;
  uid: string;
  /** On-device triage's flagged seconds: the cloud model reads only these. */
  window?: ClipWindow;
  /** Why the clip goes to the cloud (the route's reason); a plain consented read by default. */
  reason?: RouteReason;
  /**
   * A whole-clip retry after a flagged window showed no one. It never writes or renews consent and never
   * uploads: the record and clip from the first read must still be there, or it is refused and the family
   * consents again.
   */
  retry?: boolean;
  /**
   * False once this search's media was deleted after the read began (the form's delete epoch moved). Read at
   * every step, with the cloud pause; a reply that arrives after it turns false is discarded.
   */
  stillCurrent?: () => boolean;
};

/** Why the read must stop now, if it must: a delete since it began, or the cloud pause. */
function halted(r: Pick<ClipReadRequest, "stillCurrent" | "killCloud">): ClipReadOutcome | null {
  if (r.stillCurrent && !r.stillCurrent()) return { kind: "refused", message: MEDIA_DELETED };
  if (r.killCloud()) return { kind: "refused", message: PAUSED };
  return null;
}

export type ClipReadDeps = {
  findReading: (sha256: string) => Promise<StoredClipReading | null>;
  /** The record read from the server only (never a cache); throws when the server cannot be reached. */
  confirmReading: (sha256: string) => Promise<StoredClipReading | null>;
  writeConsent: (record: ClipRecordDoc) => Promise<void>;
  clipExists: (sha256: string) => Promise<boolean>;
  upload: (sha256: string, bytes: Uint8Array, mimeType: string) => Promise<void>;
  generate: (base64: string, mimeType: string, window?: ClipWindow) => Promise<{ text: string; inferenceSource?: string }>;
  complete: (sha256: string, reading: CameraSightingInput | ClipNoSighting, route: RouteRecord) => Promise<void>;
  nowMs: () => number;
};

/** The Storage and Firestore side of a clip read (everything except the model and the clock). */
export type ClipIo = Omit<ClipReadDeps, "generate" | "nowMs">;

/**
 * The read's dependencies. The generator is passed through as it is: a wrapper that forwards
 * only (clip, type) would drop triage's window and send the model the whole clip's timeline.
 */
export function clipReadDeps(io: ClipIo, generate: ClipReadDeps["generate"], nowMs: () => number = () => Date.now()): ClipReadDeps {
  return { ...io, generate, nowMs };
}

export type ClipReadOutcome =
  | { kind: "refused"; message: string }
  | { kind: "could-not-read" }
  | { kind: "failed" }
  | {
      kind: "read";
      sha256: string;
      reading: CameraSightingInput;
      colorSuppressed: boolean;
      bearingDeg: number | null;
      route: RouteRecord | null;
      cached: boolean;
    };

/**
 * Reads one staged clip in the cloud, in the Android family app's order: size, length and the
 * three consents are checked before anything leaves the laptop; a stored reading is never sent
 * to the model again; the consent record goes first, so every stored clip has one.
 */
export async function readClip(r: ClipReadRequest, deps: ClipReadDeps): Promise<ClipReadOutcome> {
  const size = sizeProblem(r.bytes.length);
  if (size) return { kind: "refused", message: size };
  if (!(r.durationS > 0)) return { kind: "refused", message: NO_LENGTH };
  const sha = await sha256Hex(r.bytes);
  if (!consentComplete(r.consent, sha)) return { kind: "refused", message: NEEDS_CONSENT };
  if (halted(r)) return halted(r)!;
  // The consent covers these exact bytes: check them again at each boundary they cross.
  const unchanged = async () => (await sha256Hex(r.bytes)) === sha;
  const { clipSha256: _sha, ...consent } = r.consent;

  try {
    const found = await deps.findReading(sha);
    const storedMiss = !!found?.reading && (found.reading as { status?: unknown }).status === "no_sighting";
    // Older code also stored a miss from a flagged window. That says nothing about the rest of the clip,
    // and a completed record is read-only, so such a clip is read again on the stored record's consent
    // (while it has not expired) and nothing is written.
    const oldWindowedMiss = storedMiss && found?.route?.reason === "on_device_triage_flagged";
    if (oldWindowedMiss && !(found!.expiresAtMs > deps.nowMs())) return { kind: "could-not-read" };
    // Any other stored no-sighting result is final for these bytes: no second model call.
    if (storedMiss && !oldWindowedMiss) return { kind: "could-not-read" };
    if (found?.reading && !oldWindowedMiss) {
      const s = parseCameraSighting(JSON.stringify(found.reading));
      const check = s ? checkSighting(s, found.durationS) : null;
      if (!s || !check?.ok) return { kind: "could-not-read" };
      // No model call and no write: the facing just given sets the bearing.
      return { kind: "read", sha256: sha, reading: check.cleaned, colorSuppressed: check.colorSuppressed, bearingDeg: bearingFromExit(r.cameraFacingDeg, s.exitEdge), route: found.route, cached: true };
    }
    if (r.retry && !found) return { kind: "refused", message: CONSENT_GONE };
    if (!(await unchanged())) return { kind: "refused", message: NEEDS_CONSENT };
    if (halted(r)) return halted(r)!;
    const started = deps.nowMs();
    if (!oldWindowedMiss && !r.retry) {
      await deps.writeConsent(
        found
          ? takeOverConsent(found, consent, started, r.uid)
          : consentRecord({ incidentId: r.incidentId, sha256: sha, durationS: r.durationS, clipStartMs: r.clipStartMs, clockConfirmed: r.clockConfirmed, cameraFacingDeg: r.cameraFacingDeg, consent, uid: r.uid, nowMs: started }),
      );
    }
    // The pause is read live again here: it may have arrived while the consent record was saving.
    if (halted(r)) return halted(r)!;
    // A retry may find the clip already stored; clips are create-only, so a second upload is refused.
    // An old windowed miss is read again from these bytes inline and uploads nothing, but its clip must still
    // be stored: a delete removes it, and a gone clip means its consent was withdrawn.
    const stored = found ? await deps.clipExists(sha) : false;
    if (!stored) {
      if (r.retry || oldWindowedMiss) return { kind: "refused", message: CONSENT_GONE };
      // And once more after that lookup, right before the clip leaves the laptop.
      if (halted(r)) return halted(r)!;
      await deps.upload(sha, r.bytes, r.mimeType);
    }
    if (!(await unchanged())) return { kind: "refused", message: NEEDS_CONSENT };
    if (halted(r)) return halted(r)!;
    // Command can delete the consent record (and the clip with it) at any time, from any seat. Read it again
    // from the server, never a cache, right before the bytes leave this laptop: unreachable, missing, expired
    // or missing one of the three consents means nothing is sent. Only synchronous checks follow before the
    // call; a delete landing in that moment is a stated limit (docs/LIMITS.md).
    let record: StoredClipReading | null;
    try {
      record = await deps.confirmReading(sha);
    } catch {
      return { kind: "refused", message: CONSENT_UNCONFIRMED };
    }
    const c = record?.consent;
    if (!record || !(record.expiresAtMs > deps.nowMs()) || !c?.personInClip || !c.footageOwner || !c.cloudProcessing) {
      return { kind: "refused", message: CONSENT_GONE };
    }
    if (halted(r)) return halted(r)!;
    const t0 = deps.nowMs();
    const reply = await deps.generate(bytesToBase64(r.bytes), r.mimeType, r.window);
    // A delete while the model was reading: the reply is discarded, nothing is saved.
    if (r.stillCurrent && !r.stillCurrent()) return { kind: "refused", message: MEDIA_DELETED };
    const t1 = deps.nowMs();
    const route: RouteRecord = {
      platform: "web", path: reply.inferenceSource === "on_device" ? "on_device" : "cloud", stage: "sdk", model: r.model,
      reason: r.reason ?? "sdk_only_in_cloud", latencyMs: t1 - t0, sdkReported: reply.inferenceSource !== undefined, blocked: null, decidedAtMs: t1,
    };
    // A reply with no usable sighting completes the record as a typed no-sighting result, so the
    // next seat gets it cached; a model or network failure (the catch below) leaves it open.
    // Only a full-clip read is final for these bytes: a window that showed no one says nothing about
    // the rest of the clip, so it leaves the record open for a full read.
    const noSighting = async (reasons: ClipNoSightingReason[]) => {
      if (!r.window && !oldWindowedMiss) await deps.complete(sha, { status: "no_sighting", reasons }, route);
    };
    const parsed = parseCameraSighting(reply.text);
    if (!parsed) {
      await noSighting(["unreadable_reply"]);
      return { kind: "could-not-read" };
    }
    const check = checkSighting(parsed, r.durationS);
    if (!check.ok) {
      await noSighting(check.reasons as ClipNoSightingReason[]);
      return { kind: "could-not-read" };
    }
    if (!oldWindowedMiss) await deps.complete(sha, check.cleaned, route);
    return { kind: "read", sha256: sha, reading: check.cleaned, colorSuppressed: check.colorSuppressed, bearingDeg: bearingFromExit(r.cameraFacingDeg, check.cleaned.exitEdge), route, cached: false };
  } catch {
    return { kind: "failed" };
  }
}
