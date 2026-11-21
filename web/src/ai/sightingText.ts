// A caller's words read on this laptop only. Order matters and is tested:
// 1. possible crime evidence goes to no model at all;
// 2. the private-data gate asks Chrome for a text model before any SDK call;
// 3. the reply is kept only when the SDK says it ran on-device;
// 4. code checks every value, and the quote must be in the note.
// A cloud read is a separate call behind a consent tap for that one note.
// This file never counts tokens (rules gate): that path calls the cloud.

import { InferenceMode, type HybridParams, type LanguageModelCreateOptions } from "firebase/ai";
import { groundReading, isPossibleEvidence, looksEnglish, validateReading, type ClothingColor, type Direction, type ReportReading } from "@pls/engine";
import readingSchema from "../../../shared/schemas/report-reading.schema.json";
import { removePhoneNumbers } from "../data/sightings";
import { onDeviceCreateOptions } from "./gate";

export type SightingCues = { direction: Direction; topColor: ClothingColor; bottomColor: ClothingColor; footwear: string; carried: string; evidenceQuote: string };
export type SightingRead = { reading: SightingCues } | { refused: "no-on-device-model" | "not-on-device" | "invalid" | "possible-evidence" | "timeout" };

const P = readingSchema.properties;

export const SIGHTING_CUES_JSON = {
  type: "object",
  properties: {
    direction: { type: "string", enum: P.direction.enum },
    topColor: { type: "string", enum: P.topColor.enum },
    bottomColor: { type: "string", enum: P.bottomColor.enum },
    footwear: { type: "string", maxLength: P.footwear.maxLength },
    carried: { type: "string", maxLength: P.carried.maxLength },
    evidenceQuote: { type: "string", maxLength: P.evidenceQuote.maxLength },
  },
  required: ["direction", "topColor", "bottomColor", "footwear", "carried", "evidenceQuote"],
} as const;

const SYSTEM = [
  "You read a note about someone who was seen, for a search team.",
  "Fill only what the note says: direction of travel, top and bottom colour, footwear and anything carried.",
  "Use \"unknown\" or an empty string when the note does not say. Never guess.",
  "evidenceQuote: copy the exact words from the note that support your answer.",
].join(" ");

/** The one options object for the on-device read: the gate asks Chrome with it, and the model is created with it. */
export const SIGHTING_TEXT_OPTS: LanguageModelCreateOptions = onDeviceCreateOptions("text", SYSTEM);

export function sightingTextParams(): HybridParams {
  return { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: SIGHTING_TEXT_OPTS, promptOptions: { responseConstraint: SIGHTING_CUES_JSON } } };
}

type Reply = { text: string; inferenceSource: string | undefined };

/**
 * How long a note read on this laptop may take before the form gives up and asks for the fields by hand. Measured on
 * Chrome's built-in model on a fast Mac, a page's first note read took 27.9 s and later ones 2 to 3 s
 * (docs/evidence/web/2026-11-21-note-read-chrome.json), so a slower laptop's first read needs far more than 30 s.
 * A model download that is still running is never cancelled; only the reply is given up on.
 */
export const NOTE_READ_TIMEOUT_MS = 90_000;

export type SightingTextDeps = {
  available: (options: LanguageModelCreateOptions) => Promise<boolean>;
  generate: (text: string) => Promise<Reply>;
  /** The reply only. */
  timeoutMs: number;
};

function checked(replyText: string, note: string): SightingCues | null {
  let c: SightingCues;
  try {
    c = JSON.parse(replyText) as SightingCues;
  } catch {
    return null;
  }
  const reading: ReportReading = {
    kind: "sighting",
    segmentIds: [],
    method: "unknown",
    coverage: null,
    minutes: null,
    searchers: null,
    searchType: "unknown",
    detectionRangeM: null,
    item: "",
    feature: "none",
    direction: c.direction,
    topColor: c.topColor,
    bottomColor: c.bottomColor,
    footwear: c.footwear,
    carried: c.carried,
    matchesProfile: "unknown",
    evidenceQuote: c.evidenceQuote,
  };
  if (!validateReading(reading, [], note).ok) return null;
  // A value the note does not support (filled from the missing person's profile, say) is blanked.
  const g = groundReading(reading, note);
  return { direction: g.direction, topColor: g.topColor, bottomColor: g.bottomColor, footwear: notUnknown(g.footwear), carried: notUnknown(g.carried), evidenceQuote: g.evidenceQuote };
}

/** Free-text fields: the model may answer "unknown" for "the note does not say", which must leave the field empty. */
function notUnknown(v: string): string {
  return v.trim().toLowerCase() === "unknown" ? "" : v;
}

export async function readSightingText(text: string, deps: SightingTextDeps): Promise<SightingRead> {
  const note = removePhoneNumbers(text);
  if (isPossibleEvidence(note)) return { refused: "possible-evidence" };
  let ok = false;
  try {
    ok = await deps.available(SIGHTING_TEXT_OPTS);
  } catch {
    ok = false;
  }
  if (!ok) return { refused: "no-on-device-model" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), deps.timeoutMs);
  });
  try {
    const reply = await Promise.race([deps.generate(note), late]);
    if (reply === "timeout") return { refused: "timeout" };
    if (reply.inferenceSource !== "on_device") return { refused: "not-on-device" };
    const cues = checked(reply.text, note);
    return cues ? { reading: cues } : { refused: "invalid" };
  } finally {
    clearTimeout(timer);
  }
}

export type CloudConsent = { byUid: string; atMs: number };
export type CloudSightingDeps = { generateCloud: (text: string) => Promise<Reply>; killCloud: boolean };

/** A cloud read of one note, only after a consent tap for that note. */
export async function readSightingTextInCloud(
  text: string,
  consent: CloudConsent | null,
  deps: CloudSightingDeps,
): Promise<{ reading: SightingCues; sentBytes: number } | { refused: "possible-evidence" | "cloud-paused" | "not-in-cloud" | "invalid" | "not-english" }> {
  if (!consent || !consent.byUid || !Number.isFinite(consent.atMs)) throw new Error("A cloud read needs a consent tap for this note.");
  // The language screen reads the note exactly as typed: removing a number writes "[number removed]", English words
  // that could make a note in another language pass.
  if (!looksEnglish(text)) return { refused: "not-english" };
  const note = removePhoneNumbers(text);
  if (isPossibleEvidence(note)) return { refused: "possible-evidence" };
  if (deps.killCloud) return { refused: "cloud-paused" };
  const reply = await deps.generateCloud(note);
  if (reply.inferenceSource !== "in_cloud") return { refused: "not-in-cloud" };
  const cues = checked(reply.text, note);
  // sentBytes: the note as the template received it (phone numbers removed), for the "What ran" receipt.
  return cues ? { reading: cues, sentBytes: new TextEncoder().encode(note).length } : { refused: "invalid" };
}
