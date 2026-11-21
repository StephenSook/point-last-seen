// A team's paper debrief sheet, read on this laptop only, one photo per call. Same order as a family photo: the gate
// asks Chrome for image input before any SDK call; a reply counts only when the SDK says it ran on-device; code
// checks every value against this search's own segments and teams. Handwriting can be misread, so nothing read here
// is saved until command has checked each field against the paper. No cloud read exists for a sheet: the photo never
// leaves the laptop. This file never counts tokens (rules gate): that path calls the cloud.

import { InferenceMode, type HybridParams, type LanguageModelCreateOptions } from "firebase/ai";
import { MAX_MINUTES, MAX_NOTE } from "../data/debriefs";
import { removePhoneNumbers } from "../data/phoneNumbers";
import { onDeviceCreateOptions } from "./gate";

/** The sheet's coverage ticks (the printed sheet offers the same four), or none ticked. */
const COVERAGE = ["25", "50", "75", "100"] as const;

const NOTE = { type: "string", maxLength: MAX_NOTE } as const;

export const DEBRIEF_SHEET_JSON = {
  type: "object",
  properties: {
    team: { type: "string", maxLength: 40 },
    segment: { type: "string", maxLength: 8 },
    minutes: { type: "string", maxLength: 4 },
    coverage: { type: "string", enum: [...COVERAGE, "none"] },
    worked: NOTE,
    didNotWork: NOTE,
    clues: NOTE,
    hazards: NOTE,
  },
  required: ["team", "segment", "minutes", "coverage", "worked", "didNotWork", "clues", "hazards"],
} as const;

const SYSTEM = [
  "You read one handwritten search debrief sheet. Copy what is written; never guess or fill a blank.",
  "team: the Team box. segment: the Segment box, letters only. minutes: the Minutes searched boxes, digits only.",
  "coverage: the one ticked box of 25, 50, 75 or 100; none when no box or more than one is ticked.",
  "worked, didNotWork, clues, hazards: the words in each box, empty when blank. Never write a person's name or a phone number.",
].join(" ");

/** The one options object for sheet reads: the gate asks Chrome with it, and the model is created with it. */
export const DEBRIEF_SHEET_OPTS: LanguageModelCreateOptions = onDeviceCreateOptions("image", SYSTEM);

export function debriefSheetParams(): HybridParams {
  return { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: DEBRIEF_SHEET_OPTS, promptOptions: { responseConstraint: DEBRIEF_SHEET_JSON } } };
}

export type SheetField = "team" | "segment" | "minutes" | "coverage" | "worked" | "didNotWork" | "clues" | "hazards";
/** The sheet as the debrief form's boxes, and what code found wrong with any of them. */
export type SheetRead = { form: Record<SheetField, string>; problems: Partial<Record<SheetField, string>> };

const FIELDS: readonly SheetField[] = ["team", "segment", "minutes", "coverage", "worked", "didNotWork", "clues", "hazards"];

/** What a read is checked against: the debrief it was opened from (`segmentId`), and this search's segments and teams. */
export type SheetContext = { segmentId: string; segmentIds: readonly string[]; teams: readonly { teamId: string; name: string }[] };

/**
 * The model's reply as the form's boxes, each checked: null when it is not the sheet's shape at all. Code cannot see
 * the photo, so the segment is checked against the debrief the read was opened from: a sheet for another segment is
 * flagged, and the confirm form saves only when its segment box is that debrief's own.
 */
export function cleanSheet(raw: unknown, ctx: SheetContext): SheetRead | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!FIELDS.every((f) => typeof r[f] === "string")) return null;
  const s = (f: SheetField) => (r[f] as string).trim();
  const problems: SheetRead["problems"] = {};

  const segmentRead = s("segment").toUpperCase();
  const segment = segmentRead.replace(/[^A-Z]/g, "");
  if (segment === "") problems.segment = "No segment read from the sheet.";
  // A digit or a mark in the read is a misread to check, never something to clean into a match ("AA1" is not "AA").
  else if (segment !== segmentRead.replace(/\s+/g, "")) problems.segment = `Read as ${segmentRead}: check the segment on the sheet.`;
  else if (!ctx.segmentIds.includes(segment)) problems.segment = "Not a segment of this search.";
  else if (segment !== ctx.segmentId) problems.segment = `This sheet is for segment ${segment}, not ${ctx.segmentId}.`;
  const teamRead = s("team");
  const team = ctx.teams.find((t) => t.name.toLowerCase() === teamRead.toLowerCase());
  if (!team) problems.team = "Not a team of this search.";
  const minutes = s("minutes");
  if (!/^\d+$/.test(minutes) || Number(minutes) > MAX_MINUTES) problems.minutes = `Not whole minutes from 0 to ${MAX_MINUTES}.`;
  const tick = s("coverage");
  const coverage = (COVERAGE as readonly string[]).includes(tick) ? tick : "";
  if (coverage === "") problems.coverage = "No box ticked, or more than one.";
  // A debrief is stored for the whole drill, so a number written on the sheet is removed before command sees it,
  // then the note is kept to the debrief's length (the replacement can be longer than the number).
  const note = (f: SheetField) => removePhoneNumbers(s(f)).slice(0, MAX_NOTE);

  return {
    form: {
      team: team?.name ?? teamRead,
      segment,
      minutes: minutes.replace(/^0+(?=\d)/, ""),
      coverage,
      worked: note("worked"),
      didNotWork: note("didNotWork"),
      clues: note("clues"),
      hazards: note("hazards"),
    },
    problems,
  };
}

type Reply = { text: string; inferenceSource: string | undefined };

/**
 * How long the command post waits for a sheet's reply. Chrome's first image read took 31 s on a fast Mac
 * (docs/evidence/web/2026-11-21-debrief-sheet-chrome.json) and later ones 4 to 7 s, so the limit leaves room for a
 * first read on a slower laptop. The read runs on this laptop and costs nothing, so waiting longer spends only time.
 */
export const SHEET_READ_TIMEOUT_MS = 90_000;

/** Why a sheet was not read: no on-device model, a reply not made on this laptop, an unreadable reply, or a slow one. */
export type SheetRefusal = "no-on-device-model" | "not-on-device" | "invalid" | "timeout";

export type SheetDeps = {
  available: (options: LanguageModelCreateOptions) => Promise<boolean>;
  generate: (jpegBase64: string) => Promise<Reply>;
  /** The reply only; a model download that is still running is never cancelled. */
  timeoutMs: number;
};

export async function readDebriefSheetOnDevice(
  jpegBase64: string,
  ctx: SheetContext,
  deps: SheetDeps,
): Promise<{ read: SheetRead } | { refused: SheetRefusal }> {
  let ok = false;
  try {
    ok = await deps.available(DEBRIEF_SHEET_OPTS);
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
    let raw: unknown;
    try {
      raw = JSON.parse(reply.text);
    } catch {
      return { refused: "invalid" };
    }
    const read = cleanSheet(raw, ctx);
    return read ? { read } : { refused: "invalid" };
  } finally {
    clearTimeout(timer);
  }
}
