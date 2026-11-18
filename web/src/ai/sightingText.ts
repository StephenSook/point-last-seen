// A caller's words read on this laptop only. Order matters and is tested:
// 1. possible crime evidence goes to no model at all;
// 2. the private-data gate asks Chrome for a text model before any SDK call;
// 3. the reply is kept only when the SDK says it ran on-device;
// 4. code checks every value, and the quote must be in the note.
// A cloud read is a separate call behind a consent tap for that one note.
// This file never counts tokens (rules gate): that path calls the cloud.

import { InferenceMode, type HybridParams, type LanguageModelCreateOptions } from "firebase/ai";
import { isPossibleEvidence, validateReading, type ClothingColor, type Direction, type ReportReading } from "@pls/engine";
import readingSchema from "../../../shared/schemas/report-reading.schema.json";
import { removePhoneNumbers } from "../data/sightings";
import { onDeviceCreateOptions } from "./gate";

export type SightingCues = { direction: Direction; topColor: ClothingColor; bottomColor: ClothingColor; footwear: string; carried: string; evidenceQuote: string };
export type SightingRead = { reading: SightingCues } | { refused: "no-on-device-model" | "not-on-device" | "invalid" | "possible-evidence" };

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

export type SightingTextDeps = {
  available: (options: LanguageModelCreateOptions) => Promise<boolean>;
  generate: (text: string) => Promise<Reply>;
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
  return { direction: c.direction, topColor: c.topColor, bottomColor: c.bottomColor, footwear: c.footwear, carried: c.carried, evidenceQuote: c.evidenceQuote };
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
  const reply = await deps.generate(note);
  if (reply.inferenceSource !== "on_device") return { refused: "not-on-device" };
  const cues = checked(reply.text, note);
  return cues ? { reading: cues } : { refused: "invalid" };
}

export type CloudConsent = { byUid: string; atMs: number };
export type CloudSightingDeps = { generateCloud: (text: string) => Promise<Reply>; killCloud: boolean };

/** A cloud read of one note, only after a consent tap for that note. */
export async function readSightingTextInCloud(
  text: string,
  consent: CloudConsent | null,
  deps: CloudSightingDeps,
): Promise<{ reading: SightingCues } | { refused: "possible-evidence" | "cloud-paused" | "not-in-cloud" | "invalid" }> {
  if (!consent || !consent.byUid || !Number.isFinite(consent.atMs)) throw new Error("A cloud read needs a consent tap for this note.");
  const note = removePhoneNumbers(text);
  if (isPossibleEvidence(note)) return { refused: "possible-evidence" };
  if (deps.killCloud) return { refused: "cloud-paused" };
  const reply = await deps.generateCloud(note);
  if (reply.inferenceSource !== "in_cloud") return { refused: "not-in-cloud" };
  const cues = checked(reply.text, note);
  return cues ? { reading: cues } : { refused: "invalid" };
}
