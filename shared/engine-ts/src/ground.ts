// Grounds a reading in its note (shared/constants/grounding-words.json). A model can fill a field from the
// subject's profile instead of the note ("blue" because the profile says a blue jacket); a colour, a direction,
// footwear or a carried item the note does not support is blanked, so a report never claims what nobody wrote.
import words from "../../constants/grounding-words.json";
import type { ClothingColor, Direction, ReportReading } from "./types";

const COLOR = words.colorWords as Record<string, string[]>;
const DIRECTION = words.directionWords as Record<string, string[]>;
const CAPITAL = words.capitalLetters as Record<string, string>;
const STOP = new Set(words.stopWords);
const LETTERS = /\p{L}+/gu;
const PAIR_GAP = /^[ -]+$/;

type NoteWords = { all: Set<string>; single: Set<string>; capitals: Set<string> };

function noteWords(note: string): NoteWords {
  const found = [...note.matchAll(LETTERS)];
  const lower = found.map(m => m[0].toLowerCase());
  const single = new Set(lower);
  const all = new Set(lower);
  for (let i = 0; i + 1 < found.length; i++) {
    const a = found[i]!;
    const b = found[i + 1]!;
    // "north-east" and "north east" also count as "northeast".
    if (PAIR_GAP.test(note.slice(a.index! + a[0].length, b.index!))) all.add(lower[i]! + lower[i + 1]!);
  }
  const capitals = new Set(found.map(m => m[0]).filter(w => w.length === 1 && w === w.toUpperCase() && w !== w.toLowerCase()));
  return { all, single, capitals };
}

function contentWords(text: string): string[] {
  return (text.match(LETTERS) ?? []).map(w => w.toLowerCase()).filter(w => w.length >= words.minSharedWordLength && !STOP.has(w));
}

/** Returns a copy of `reading` with each unsupported colour, direction, footwear or carried value blanked. */
export function groundReading(reading: ReportReading, note: string): ReportReading {
  const w = noteWords(note);
  const color = (c: ClothingColor): ClothingColor =>
    c === "unknown" || (COLOR[c] ?? []).some(x => w.all.has(x)) ? c : "unknown";
  const d: Direction = reading.direction;
  const directionKept =
    d === "unknown" || (DIRECTION[d] ?? []).some(x => w.all.has(x)) || (CAPITAL[d] !== undefined && w.capitals.has(CAPITAL[d]!));
  const shared = (text: string) => text === "" || contentWords(text).some(x => w.single.has(x));
  return {
    ...reading,
    topColor: color(reading.topColor),
    bottomColor: color(reading.bottomColor),
    direction: directionKept ? d : "unknown",
    footwear: shared(reading.footwear) ? reading.footwear : "",
    carried: shared(reading.carried) ? reading.carried : "",
  };
}
