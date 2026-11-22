// A family photo read on this laptop only, one photo per call. Same order as
// the caller's note: the gate asks Chrome for image input before any SDK call;
// a reply counts only when the SDK says it ran on-device; code checks every
// value. A cloud read is a separate call behind a consent tap for that photo.
// This file never counts tokens (rules gate): that path calls the cloud.

import { InferenceMode, type HybridParams, type LanguageModelCreateOptions } from "firebase/ai";
import type { PhotoCues } from "@pls/engine";
import cuesSchema from "../../../shared/schemas/photo-cues.schema.json";
import { onDeviceCreateOptions } from "./gate";

const P = cuesSchema.properties;
const PLACE_TYPES: readonly string[] = P.placeType.enum;
const OUTDOORS: readonly string[] = P.outdoors.enum;

export const PHOTO_CUES_JSON = {
  type: "object",
  properties: {
    placeType: { type: "string", enum: P.placeType.enum },
    placeName: { type: "string", maxLength: P.placeName.maxLength },
    signText: { type: "string", maxLength: P.signText.maxLength },
    landmarks: { type: "array", maxItems: P.landmarks.maxItems, items: { type: "string", maxLength: P.landmarks.items.maxLength } },
    outdoors: { type: "string", enum: P.outdoors.enum },
    evidence: { type: "string", maxLength: P.evidence.maxLength },
  },
  required: ["placeType", "placeName", "signText", "landmarks", "outdoors", "evidence"],
} as const;

const SYSTEM = [
  "You read one family photo for a search team. Report only what is visible.",
  "placeType: the kind of place. signText: readable text, copied exactly; empty when none.",
  "placeName: the place's name only when it is written in signText; otherwise empty.",
  "landmarks: up to three things a searcher could find again. evidence: one line on what you saw. Never guess.",
].join(" ");

/** The one options object for photo reads: the gate asks Chrome with it, and the model is created with it. */
export const PHOTO_OPTS: LanguageModelCreateOptions = onDeviceCreateOptions("image", SYSTEM);

export function photoParams(): HybridParams {
  return { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: PHOTO_OPTS, promptOptions: { responseConstraint: PHOTO_CUES_JSON } } };
}


/** Upper-cased words: runs of letters, marks and digits after NFKC, so "Café" is one word, never "CAF". */
const wordsOf = (s: string) => s.normalize("NFKC").toUpperCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

/** Whether the name's words appear in the sign text as whole words, in order; a name with no letter or digit never does. */
function signShows(signText: string, name: string): boolean {
  const sign = wordsOf(signText);
  const want = wordsOf(name);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= sign.length; i++) if (want.every((w, j) => sign[i + j] === w)) return true;
  return false;
}

/** Closed lists checked, landmarks capped, and a place name kept only when the sign text shows it as whole words. */
export function cleanCues(c: PhotoCues): PhotoCues | null {
  if (!c || !PLACE_TYPES.includes(c.placeType) || !OUTDOORS.includes(c.outdoors)) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const signText = text(c.signText, P.signText.maxLength);
  const name = text(c.placeName, P.placeName.maxLength);
  return {
    placeType: c.placeType,
    placeName: signShows(signText, name) ? name : "",
    signText,
    landmarks: (Array.isArray(c.landmarks) ? c.landmarks : []).filter((l): l is string => typeof l === "string").slice(0, P.landmarks.maxItems).map((l) => l.slice(0, P.landmarks.items.maxLength)),
    outdoors: c.outdoors,
    evidence: text(c.evidence, P.evidence.maxLength),
  };
}

type Reply = { text: string; inferenceSource: string | undefined };

export type PhotoDeps = {
  available: (options: LanguageModelCreateOptions) => Promise<boolean>;
  generate: (jpegBase64: string) => Promise<Reply>;
  /** The reply only; a model download that is still running is never cancelled. */
  timeoutMs: number;
};

function parsed(text: string): PhotoCues | null {
  try {
    return cleanCues(JSON.parse(text) as PhotoCues);
  } catch {
    return null;
  }
}

/**
 * How long the command post waits for an on-device photo read. Chrome's first image read in a page is slow: 20 s for a
 * photo on a fast Mac (docs/evidence/web/2026-11-21-photo-read-chrome.json), and 31 s for the paper sheet read on the
 * same Mac, so a slower laptop needs far more than the 30 s it had.
 */
export const PHOTO_READ_TIMEOUT_MS = 90_000;

export async function readPhotoOnDevice(
  jpegBase64: string,
  deps: PhotoDeps,
): Promise<{ cues: PhotoCues } | { refused: "no-on-device-model" | "not-on-device" | "invalid" | "timeout" }> {
  let ok = false;
  try {
    ok = await deps.available(PHOTO_OPTS);
  } catch {
    ok = false;
  }
  if (!ok) return { refused: "no-on-device-model" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), deps.timeoutMs);
  });
  try {
    const reply = await Promise.race([deps.generate(jpegBase64), late]);
    if (reply === "timeout") return { refused: "timeout" };
    if (reply.inferenceSource !== "on_device") return { refused: "not-on-device" };
    const cues = parsed(reply.text);
    return cues ? { cues } : { refused: "invalid" };
  } finally {
    clearTimeout(timer);
  }
}

export type CloudConsent = { byUid: string; atMs: number };

/** A cloud read of one photo, only with the family's own consent for it (read from the server first). */
export async function readPhotoInCloud(
  jpegBase64: string,
  consent: CloudConsent | null,
  deps: { generateCloud: (jpegBase64: string) => Promise<Reply>; killCloud: boolean },
): Promise<{ cues: PhotoCues } | { refused: "cloud-paused" | "not-in-cloud" | "invalid" }> {
  if (!consent || !consent.byUid || !Number.isFinite(consent.atMs)) throw new Error("A cloud read needs the family's consent for this photo.");
  if (deps.killCloud) return { refused: "cloud-paused" };
  const reply = await deps.generateCloud(jpegBase64);
  if (reply.inferenceSource !== "in_cloud") return { refused: "not-in-cloud" };
  const cues = parsed(reply.text);
  return cues ? { cues } : { refused: "invalid" };
}
