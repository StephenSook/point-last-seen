import type { CameraSighting, ClipEdge, ClothingColor } from "./types";

export const MAX_CLIP_BYTES = 14_000_000;

export function base64Size(bytes: number): number {
  // Kotlin integer division truncates toward zero. Adding zero removes JS negative zero.
  return Math.trunc((bytes + 2) / 3) * 4 + 0;
}

export function sizeProblem(bytes: number): string | null {
  if (bytes <= 0) return "This clip is empty.";
  if (bytes > MAX_CLIP_BYTES) return "This clip is larger than 14,000,000 bytes. Trim it and try again.";
  return null;
}

export type ConsentMark = { byUid: string; atMs: number };

export type ClipConsent = {
  clipSha256: string;
  personInClip: ConsentMark | null;
  footageOwner: ConsentMark | null;
  cloudProcessing: ConsentMark | null;
  publicUse: ConsentMark | null;
};

export function consentComplete(c: ClipConsent, clipSha256: string): boolean {
  return c.clipSha256 === clipSha256 && c.personInClip != null && c.footageOwner != null && c.cloudProcessing != null;
}

const EXIT_OFFSETS: Record<ClipEdge, number | null> = {
  left: -90,
  right: 90,
  toward_camera: 180,
  away_from_camera: 0,
  top: null,
  bottom: null,
  unknown: null,
};

export function bearingFromExit(cameraFacingDeg: number | null, exitEdge: ClipEdge): number | null {
  const offset = EXIT_OFFSETS[exitEdge];
  if (cameraFacingDeg === null || offset === null) return null;
  // Kotlin adds these as signed 32-bit integers before floorMod.
  const bearing = (cameraFacingDeg + offset) | 0;
  return ((bearing % 360) + 360) % 360;
}

/** The Kotlin CameraSighting shape before color and box checks. */
export type CameraSightingInput = Omit<CameraSighting, "topColor" | "bottomColor" | "keyFrame"> & {
  topColor: string;
  bottomColor: string;
  keyFrame: { time: string; box2d: number[] };
};

type SightingCheckResult = {
  ok: boolean;
  reasons: string[];
  cleaned: CameraSightingInput;
  colorSuppressed: boolean;
};

const COLORS = new Set<string>([
  "black", "white", "gray", "red", "orange", "yellow", "green", "blue",
  "purple", "pink", "brown", "tan", "unknown",
] satisfies ClothingColor[]);

const MAX_CARRIED = 3;
const MAX_TEXT = 40;
const MAX_EVIDENCE = 400;
const MMSS = /^(\d{2}):([0-5]\d)$/;

// Kotlin Char.isWhitespace uses Java whitespace and Unicode separator characters.
const KOTLIN_SPACE = "[\\u0009-\\u000d\\u001c-\\u0020\\p{Z}]";
const KOTLIN_TRIM = new RegExp(`^${KOTLIN_SPACE}+|${KOTLIN_SPACE}+$`, "gu");

function seconds(time: string): number | null {
  const match = MMSS.exec(time.replace(KOTLIN_TRIM, ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function lastSeenMs(clipStartMs: number, lastSeen: string): number {
  const offset = seconds(lastSeen);
  if (offset === null) throw new Error("lastSeen is not MM:SS");
  return clipStartMs + offset * 1_000;
}

function normalizeColor(color: string): string {
  const normalized = color.replace(KOTLIN_TRIM, "").toLowerCase();
  return COLORS.has(normalized) ? normalized : "unknown";
}

function validBox(box: number[]): boolean {
  const [yMin = NaN, xMin = NaN, yMax = NaN, xMax = NaN] = box;
  return box.length === 4 && box.every(n => Number.isInteger(n) && n >= 0 && n <= 1_000)
    && yMin < yMax && xMin < xMax;
}

export function checkSighting(s: CameraSightingInput, durationS: number): SightingCheckResult {
  const reasons: string[] = [];
  if (!s.personVisible) reasons.push("no_person");
  const first = seconds(s.firstSeen);
  const last = seconds(s.lastSeen);
  const key = seconds(s.keyFrame.time);

  if (first === null) reasons.push("first_seen_format");
  if (last === null) reasons.push("last_seen_format");
  if (key === null) reasons.push("key_frame_format");
  if (first !== null && last !== null && first > last) reasons.push("first_after_last");
  if (last !== null && last > durationS) reasons.push("last_after_clip_end");
  if (first !== null && first > durationS) reasons.push("first_after_clip_end");
  if (key !== null && key > durationS) reasons.push("key_frame_after_clip_end");
  if (!validBox(s.keyFrame.box2d)) reasons.push("box");

  const colorSuppressed = s.lighting === "night_ir";
  const cleaned: CameraSightingInput = {
    ...s,
    topColor: colorSuppressed ? "unknown" : normalizeColor(s.topColor),
    bottomColor: colorSuppressed ? "unknown" : normalizeColor(s.bottomColor),
    topType: s.topType.slice(0, MAX_TEXT),
    footwear: s.footwear.slice(0, MAX_TEXT),
    headwear: s.headwear.slice(0, MAX_TEXT),
    carriedItems: s.carriedItems.slice(0, MAX_CARRIED).map(item => item.slice(0, MAX_TEXT)),
    evidence: s.evidence.slice(0, MAX_EVIDENCE),
  };
  return { ok: reasons.length === 0, reasons, cleaned, colorSuppressed };
}
