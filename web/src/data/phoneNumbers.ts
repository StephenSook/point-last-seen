// Removes anything shaped like a phone number before a note is stored or read: the shared rule, ported line for
// line from the Android family app (android/app/src/main/java/app/pointlastseen/family/core/PhoneNumbers.kt) and
// checked against shared/test-vectors/phone-numbers.json. Seven or more digits in a row are a number: written
// digits (any script, full-width folded, Chinese numerals, circled and other number characters) and spoken digit
// words count alike, joined by any separators (spaces, punctuation and symbols, any number of them, but never ":"
// "%" or "°", which mark a time, a percent or a degree; a line break with its indent counts as one, and accents or
// joiners in a gap count as nothing) and with an optional leading + or (. Report numbers (times, minutes, segments, searchers, percents) are far shorter, so they stay.
//
// Search information made of digits can sit inside such a run: a written date, a time, a coordinate pair, a ZIP+4
// code after a state, a month-name date. It stays only when the rest of the run is nothing or whole numbers of
// seven or more digits (which are removed); when any other piece of 1 to 6 digits is left beside it, the whole run
// is removed, since that piece could be part of a number. A street name (67th Ave: one to three digits, an ordinal
// ending, a street word) never joins others. A removed run keeps its line breaks.
// String positions are UTF-16 units, as on the JVM, so every length below matches the Android rule.

export const REPLACEMENT = "[number removed]";

// Spoken digits in English, and in Spanish (shared/test-vectors/README.md); "un" and "una" are articles, not digits.
const DIGIT_WORDS = new Set([
  "zero", "oh", "o", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
]);
// Chinese numeral digits, and the spoken "幺" (one): counted as digits.
const CHINESE_DIGITS = "〇零一二三四五六七八九幺";
// Dashes besides the plain hyphen, as NFKC leaves them: hyphen, non-breaking hyphen, figure, en and em dash, minus.
const DASHES = "‐‑‒–—−";

const DECIMAL = /^\p{Nd}$/u;
const OTHER_NUMBER = /^[\p{No}\p{Nl}]$/u;
const LETTER = /^\p{L}$/u;
// A mark or format character: dropped from a gap, as the Android rule does.
const MARK_OR_FORMAT = /^[\p{Mn}\p{Me}\p{Mc}\p{Cf}]$/u;
// Kotlin's whitespace: Java's isWhitespace plus every space separator (so a no-break space counts too).
const KOTLIN_SPACE = /^[\t\n\u000B\f\r\u001C-\u001F\p{Zs}\p{Zl}\p{Zp}]$/u;

// A digit: a decimal digit in any script, a Chinese numeral digit, or another number character (circled dingbat
// digits such as ❶, Hangzhou 〡, Ethiopic ፩). Fractions are folded to digits by NFKC before this is asked.
function isDigit(cp: number): boolean {
  const c = String.fromCodePoint(cp);
  return DECIMAL.test(c) || CHINESE_DIGITS.includes(c) || OTHER_NUMBER.test(c);
}

const isLetter = (cp: number) => LETTER.test(String.fromCodePoint(cp));
const charCount = (cp: number) => (cp > 0xffff ? 2 : 1);
const isAsciiNumber = (t: string) => t.length > 0 && /^[0-9]+$/.test(t);
const isBlank = (t: string) => [...t].every((c) => KOTLIN_SPACE.test(c));

const MONTHS = new Set(["jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july", "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december"]);
// A number with one of these endings, before a street word, is a street name (67th Ave) and never joins other digits.
const ORDINALS = new Set(["st", "nd", "rd", "th"]);
const STREETS = new Set(["ave", "avenue", "st", "street", "rd", "road", "blvd", "boulevard", "dr", "drive", "ln", "lane", "pl", "place", "way", "ct", "court", "pkwy", "parkway", "hwy", "highway", "ter", "terrace", "cir", "circle", "sq", "square", "trl", "trail"]);
// US state and territory codes, written in capitals (GA 30301-1234); lower case would match common words.
const STATES = new Set(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "GU", "VI"]);

// Matched against a gap after flat(), so a space is " " and a line break "\n". A comma, semicolon, bullet, middle dot,
// bar or slash (with up to two spaces around it) then a minus, or a minus with a space before it. The minus is the
// western longitude every drill site has: two decimals with no minus between them can be two phone numbers
// (33.12345678, 33.87654321 is two Mexican numbers), and a bare minus between two decimals is a dotted number.
const COORDINATE_GAP = /^(?:[ \n]{0,2}[,;\u2022\u00b7|/][ \n]{0,2}-|[ \n]{1,2}-)$/;
// A word that says the next digits are a phone number; one of these just before a decimal pair makes it two numbers.
const PHONE_CUES = new Set(["call", "tel", "phone", "cell", "mobile", "number", "llame", "llamar", "tel\u00e9fono", "telefono", "celular", "n\u00famero", "numero"]);
// The one short word that may sit between a cue and its number (Llame al 33.1234, -84.5678; Call at ...).
const CUE_CONNECTORS = new Set(["al", "a", "at", "on", "to"]);
const MONTH_DAY_GAP = /^\.?[ \n]{1,2}$/;
const DAY_MONTH_GAP = /^[ \n]{1,2}$/;
const YEAR_GAP = /^,?[ \n]{1,2}$/;
const BREAK = /\r\n|\n|\r|\u0085|\u2028|\u2029/g;
const LINE_BREAK = /(\r\n|\n|\r|\u0085|\u2028|\u2029)[ \t]*/g;

// A spoken repeat before a digit counts the extra digits it stands for: "triple five" is three digits.
const REPEATS: Record<string, number> = { double: 1, triple: 2 };

/** A run of digits (counting its digits), or a word (one if it is a spoken digit, else none). */
type Part = { start: number; end: number; digits: number; written: boolean; alone: boolean };
type Span = { first: number; last: number; isTime: boolean };

function range(first: number, last: number): number[] {
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i);
  return out;
}

// A run made only of clock times: two or more h:mm in ASCII digits (hour 0 to 23, minutes 00 to 59) separated by
// commas or spaces, with no digit before or after it through anything but letters.
const TIMES_RUN = /(?<!\p{N}[^\p{L}\p{N}]*)(?:[01]?\d|2[0-3]):[0-5]\d(?:[ ,]+(?:[01]?\d|2[0-3]):[0-5]\d)+(?![^\p{L}\p{N}]*\p{N})/gu;
// Before a run of times, two more words cue a number (Text 21:25 5:50 1:42; Reach me at 4:04 5:55 6:42).
const TIME_CUES = new Set([...PHONE_CUES, "text", "reach"]);
// How many words before a run of times are read for a cue.
const CUE_WINDOW = 3;

// A "[number removed]" at the end of the text before a run, or at the start of the text after it, with no letter or
// digit between.
const MARKER_BEFORE = /\[number removed\][^\p{L}\p{N}]*$/u;
const MARKER_AFTER = /^[^\p{L}\p{N}]*\[number removed\]/u;

/** Whether part p is a word of a "[number removed]" already in s, which stands for digits that were removed. */
function inMarker(s: string, p: Part): boolean {
  // A marker word starts at most REPLACEMENT.length characters after the marker's "[", so only that far back is read
  // (a search back to the start of the note made a long note's scrub take seconds).
  for (let at = p.start; at >= 0 && at > p.start - REPLACEMENT.length; at--) {
    if (s[at] === "[") return s.startsWith(REPLACEMENT, at) && p.end <= at + REPLACEMENT.length;
  }
  return false;
}

/** Whether a phone cue sits before the run starting at parts[first]: a cue word among the three words before it, or a "#". */
function cuedRun(s: string, parts: Part[], first: number): boolean {
  // A part carrying digits (written, spoken, or a counted double or triple) is read past and is not one of the three
  // words: "Call one: 4:04 5:55 6:42" and "Call 5 at 4:04 5:55 6:42" are cued. So are the words of a "[number removed]"
  // already in the note, which stands for removed digits: its "number" is never a cue, and a note scrubbed again reads
  // the same words before the run as it did the first time (Witness [number removed] at 14:03 14:10 stays).
  let j = first - 1;
  for (let words = 0; j >= 0 && words < CUE_WINDOW; j--) {
    if (parts[j]!.digits > 0 || inMarker(s, parts[j]!)) continue;
    if (TIME_CUES.has(word(s, parts[j]!))) return true;
    words++;
  }
  return s.substring(j >= 0 ? parts[j]!.end : 0, parts[first]!.start).includes("#");
}

/** The most passes of the rule one scrub runs; every note in the shared corpus settles in two. */
export const MAX_PASSES = 4;

/**
 * Runs once() until the text stops changing, at most MAX_PASSES times in all, so a scrubbed note scrubbed again
 * changes nothing (a note is scrubbed when it is read and again when it is saved). When it never settles, onCap() is
 * told and the last pass's text, the most scrubbed, is returned.
 */
export function settle(text: string, once: (s: string) => string, onCap: () => void): string {
  let out = once(text);
  for (let pass = 1; pass < MAX_PASSES; pass++) {
    const next = once(out);
    if (next === out) return out;
    out = next;
  }
  onCap();
  return out;
}

/** The shared rule, settled: what every caller uses. The warning names no note text. */
export function removePhoneNumbers(text: string): string {
  return settle(text, removePhoneNumbersOnce, () => console.warn("phone-number removal did not settle in 4 passes"));
}

/**
 * One pass of the shared rule. A run of times the rule reads as its own group (no digit, written or spoken, joined to
 * it on either side) is decided whole. In clock order (each time no earlier than the one before) with no phone cue
 * before it, it is search information and stays (The possible times are 14:03, 14:10, 14:17.). Out of order or after
 * a cue it could be a number written as times (Call 21:25 5:50 1:42, 12:12 5:55 01:42), and the whole run goes: when
 * in doubt, remove. The text between such runs follows the shared rule unchanged, and so does every note that NFKC
 * changes, since folding can turn other characters into the ASCII digits a run is made of. Exported only for checks
 * of one pass against the README; every caller uses removePhoneNumbers.
 */
export function removePhoneNumbersOnce(text: string): string {
  const folded = text.normalize("NFKC");
  if (folded !== text) return removeByRule(folded);
  const parts = ruleParts(folded);
  const startsAt = new Map(parts.map((p, i) => [p.start, i] as const));
  const endsAt = new Map(parts.map((p, i) => [p.end, i] as const));
  let out = "";
  let from = 0;
  const runs = [...folded.matchAll(TIMES_RUN)];
  // Every part inside a run of times, so digits joined after one run never reach into another.
  const inTimes = new Set<number>();
  for (const m of runs) {
    const a = startsAt.get(m.index);
    const b = endsAt.get(m.index + m[0].length);
    if (a !== undefined && b !== undefined) for (let i = a; i <= b; i++) inTimes.add(i);
  }
  for (const m of runs) {
    const first = startsAt.get(m.index);
    const last = endsAt.get(m.index + m[0].length);
    if (first === undefined || last === undefined) continue;
    const joinedBefore = first > 0 && joins(folded, parts[first - 1]!, parts[first]!);
    const joinedAfter = last + 1 < parts.length && joins(folded, parts[last]!, parts[last + 1]!);
    const joined = joinedBefore || joinedAfter;
    // A "[number removed]" right before or after a run with nothing joined to it, with no letter or digit between,
    // stands for digits joined to the run, so the run goes, whatever else is beside it (Dial [number removed] 4:04 5:55
    // 12:12). A run with digits joined to it is left to the shared rule below, as it was before this check.
    if (!joined && (MARKER_BEFORE.test(folded.substring(from, m.index)) || MARKER_AFTER.test(folded.substring(m.index + m[0].length)))) {
      out += removeByRule(folded.substring(from, m.index)) + REPLACEMENT;
      from = m.index + m[0].length;
      continue;
    }
    // A run right after a "[number removed]" with digits joined only after it (Dial [number removed] 4:04 5:55 one two one
    // two) is one number with them, and the shared rule alone would leave the run's first hour. The run goes with the
    // digits joined after it, keeping line breaks, but only where nothing could be search information: the joined
    // digits end before a part that does not join, or before another run of times, never at a sentence end or a lone
    // time; and there are at least two of them, so a count after the times (one searcher) stays. Otherwise the shared
    // rule decides, as before.
    const cut = joinedAfter && !joinedBefore ? markerJoinedGroup(folded, parts, inTimes, from, m.index, last) : null;
    if (cut !== null) {
      const breaks = (folded.substring(m.index, cut).match(LINE_BREAK) ?? []).length;
      out += removeByRule(folded.substring(from, m.index)) + Array.from({ length: breaks + 1 }, () => REPLACEMENT).join("\n");
      from = cut;
      continue;
    }
    // A month name beside the run reads its hour or minutes as a day (14 May 6:00 7:00, 7:14 May 2026), which changes
    // how the shared rule groups the digits around it, so such a run stays with the text around it.
    const month = (i: number) => i >= 0 && i < parts.length && !parts[i]!.written && MONTHS.has(word(folded, parts[i]!));
    if (joined || month(first - 1) || month(last + 1)) continue;
    const minutes = [...m[0].matchAll(/(\d+):(\d+)/g)].map((t) => Number(t[1]) * 60 + Number(t[2]));
    const inOrder = minutes.every((v, i) => i === 0 || v >= minutes[i - 1]!);
    out += removeByRule(folded.substring(from, m.index)) + (inOrder && !cuedRun(folded, parts, first) ? m[0] : REPLACEMENT);
    from = m.index + m[0].length;
  }
  return out + removeByRule(folded.substring(from));
}

// A sentence end between two joined parts: a stop, "!" or "?" before a space or line break.
const SENTENCE_END = /[.!?][\s\u0085\u2028\u2029]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Whether a "[number removed]" ends right before `at`, with nothing but separators between, and starts at or after
 * `from` (what MARKER_BEFORE tests on s.substring(from, at)), read back only to the last letter or digit before `at`.
 */
function markerRightBefore(s: string, from: number, at: number): boolean {
  let j = at;
  while (j > from) {
    let k = j - 1;
    const c = s.charCodeAt(k);
    if (c >= 0xdc00 && c <= 0xdfff && k > from && s.charCodeAt(k - 1) >= 0xd800 && s.charCodeAt(k - 1) <= 0xdbff) k--;
    if (LETTER_OR_DIGIT.test(s.slice(k, j))) break;
    j = k;
  }
  // j is just after the last letter or digit: a marker ending there ends with its "d]".
  const start = j + 1 - REPLACEMENT.length;
  return start >= from && j + 1 <= at && s.startsWith(REPLACEMENT, start);
}

/**
 * Where a run of times right after a marker ends together with the digits joined after it (an index in s), or null
 * when the shared rule should decide: when the joined digits run into a lone time or across a sentence end, which the
 * shared rule reads with what follows, or when there are fewer than two of them. The digits stop before a part that
 * does not join, or before another run of times, which is decided on its own.
 */
function markerJoinedGroup(s: string, parts: Part[], inTimes: ReadonlySet<number>, from: number, runStart: number, last: number): number | null {
  if (!markerRightBefore(s, from, runStart)) return null;
  const link = (a: Part, b: Part) => joins(s, a, b) && !SENTENCE_END.test(s.substring(a.end, b.start));
  const timeShaped = (p: Part) => s[p.start - 1] === ":" || s[p.end] === ":";
  let hi = last;
  let digits = 0;
  while (hi + 1 < parts.length && !inTimes.has(hi + 1) && !timeShaped(parts[hi + 1]!) && link(parts[hi]!, parts[hi + 1]!)) {
    hi++;
    digits += parts[hi]!.digits;
  }
  const next = hi + 1 < parts.length ? parts[hi + 1]! : null;
  if (next && !inTimes.has(hi + 1) && joins(s, parts[hi]!, next)) return null;
  if (digits < 2) return null;
  return parts[hi]!.end;
}

/** The parts of s as the shared rule reads them: a spoken repeat counted, and a street name's number set apart. */
function ruleParts(folded: string): Part[] {
  const parts = partsOf(folded);
  for (let i = 0; i < parts.length - 1; i++) {
    const repeat = REPEATS[word(folded, parts[i]!)];
    if (repeat === undefined) continue;
    if (!parts[i]!.written && parts[i + 1]!.digits > 0 && onlySeparators(folded.substring(parts[i]!.end, parts[i + 1]!.start))) parts[i]!.digits = repeat;
  }
  for (let i = 0; i < parts.length; i++) {
    // An ordinal stays apart only as a street name: one to three digits, its ending, then a street word.
    const p = parts[i]!;
    if (p.written && p.digits <= 3 && i + 2 < parts.length && !parts[i + 1]!.written && parts[i + 1]!.start === p.end && ORDINALS.has(word(folded, parts[i + 1]!)) && !parts[i + 2]!.written && STREETS.has(word(folded, parts[i + 2]!))) {
      const between = folded.substring(parts[i + 1]!.end, parts[i + 2]!.start);
      if (between.length > 0 && isBlank(between)) p.alone = true;
    }
  }
  return parts;
}

/** The shared rule on its own, as every platform runs it, without the run-of-times step above. */
export function removeByRule(text: string): string {
  const folded = text.normalize("NFKC");
  const parts = ruleParts(folded);
  const { found, kept, glued } = searchSpans(folded, parts);
  // Walk back from the end, so replacing one number never moves the ones before it.
  let out = folded;
  let k = parts.length - 1;
  while (k >= 0) {
    if (parts[k]!.digits <= 0) {
      k--;
      continue;
    }
    let start = k;
    // A dropped time's hour and minutes join each other across the colon, so its minutes go with the run too.
    while (start > 0 && (joins(folded, parts[start - 1]!, parts[start]!) || glued.has(start - 1))) start--;
    const sum = (ids: number[]) => ids.reduce((n, i) => n + parts[i]!.digits, 0);
    if (sum(range(start, k)) >= 7) {
      const piecesKept = pieces(start, k, kept);
      // A short piece seen with every span found, or with the spans kept after dropping times, takes the whole run.
      const short = (ps: number[][]) => ps.some((p) => {
        const n = sum(p);
        return n >= 1 && n <= 6;
      });
      // The pieces again with each dropped time's colon still a break.
      const split = piecesKept.flatMap((p) => {
        const groups: number[][] = [[]];
        for (const i of p) {
          if (groups[groups.length - 1]!.length > 0 && glued.has(i - 1)) groups.push([]);
          groups[groups.length - 1]!.push(i);
        }
        return groups;
      });
      if (short(piecesKept) || short(pieces(start, k, found)) || short(split)) {
        out = replace(out, folded, parts, start, k);
      } else {
        for (const p of [...piecesKept].reverse()) out = replace(out, folded, parts, p[0]!, p[p.length - 1]!);
      }
    }
    k = start - 1;
  }
  return out;
}

/** The parts of the run start..end outside the search spans, as consecutive pieces. */
function pieces(start: number, end: number, kept: ReadonlySet<number>): number[][] {
  const out: number[][] = [];
  let open = false;
  for (let i = start; i <= end; i++) {
    if (kept.has(i)) {
      open = false;
    } else {
      if (!open) out.push([]);
      out[out.length - 1]!.push(i);
      open = true;
    }
  }
  return out;
}

/** Replaces parts[first..last] (with a leading + or ( when the run starts there), keeping any line breaks. */
function replace(out: string, s: string, parts: Part[], first: number, last: number): string {
  let lower = parts[first]!.start;
  while (lower > 0 && "+(".includes(s[lower - 1]!)) lower--;
  const upper = parts[last]!.end;
  const breaks = (s.substring(lower, upper).match(LINE_BREAK) ?? []).length;
  return out.substring(0, lower) + Array.from({ length: breaks + 1 }, () => REPLACEMENT).join("\n") + out.substring(upper);
}

/** Whether part a joins the part b right after it into one number. */
function joins(s: string, a: Part, b: Part): boolean {
  return a.digits > 0 && b.digits > 0 && !a.alone && !b.alone && onlySeparators(s.substring(a.end, b.start));
}

function word(s: string, p: Part): string {
  return s.substring(p.start, p.end).toLowerCase();
}

/**
 * The parts that are search information, as three sets: every span found, the spans kept once a time joined to
 * other digits is dropped, and the hour of each dropped time (which joins its minutes). Spans: a written date, a
 * time, a coordinate pair in range, a ZIP+4 code after a state and a month-name date. See the Android rule.
 */
function searchSpans(s: string, parts: Part[]): { found: Set<number>; kept: Set<number>; glued: Set<number> } {
  const gap = (a: number, b: number) => s.substring(parts[a]!.end, parts[b]!.start);
  // Length in UTF-16 units: a digit outside the BMP counts twice, so such digits never read as a day or a year.
  const len = (i: number) => parts[i]!.end - parts[i]!.start;
  const text = (i: number) => s.substring(parts[i]!.start, parts[i]!.end);
  const value = (i: number): number | null => (isAsciiNumber(text(i)) ? Number(text(i)) : null);
  const written = (i: number) => i >= 0 && i < parts.length && parts[i]!.written;
  const isDay = (i: number) => written(i) && len(i) <= 2 && between(value(i) ?? 0, 1, 31);
  const isYear = (i: number) => written(i) && len(i) === 4 && between(value(i) ?? 0, 1900, 2100);
  const degrees = (whole: number, frac: number, max: number) => {
    // 4 to 7 decimals: 8 after a 2-digit area code is a Mexican number (33.12345678).
    if (!written(whole) || !written(frac) || gap(whole, frac) !== "." || len(whole) > 3 || len(frac) < 4 || len(frac) > 7) return false;
    if (!isAsciiNumber(text(whole)) || !isAsciiNumber(text(frac))) return false;
    // Whole degrees never start with a zero (0.1276 is fine, 020.79460958 is a London number).
    if (text(whole).length > 1 && text(whole).startsWith("0")) return false;
    return Number(`${text(whole)}.${text(frac)}`) <= max;
  };
  // A phone cue just before part i: a "#" in the gap before it, or a cue word right before it (only spaces or a colon
  // between), or with one connector word between (Call: 33.1234, -84.5678; Llame al 33.1234, -84.5678). A cue further
  // back names a thing, not a number to dial: "Phone found at 33.7866, -84.3733" is a clue's place and stays.
  const cueBefore = (i: number) => {
    if (s.substring(i > 0 ? parts[i - 1]!.end : 0, parts[i]!.start).includes("#")) return true;
    const near = (a: number, b: number) => /^[ \n:]*$/.test(flat(s.substring(parts[a]!.end, parts[b]!.start)));
    const isWord = (j: number) => j >= 0 && parts[j]!.digits === 0 && !parts[j]!.written;
    if (isWord(i - 1) && near(i - 1, i) && PHONE_CUES.has(word(s, parts[i - 1]!))) return true;
    return isWord(i - 2) && isWord(i - 1) && CUE_CONNECTORS.has(word(s, parts[i - 1]!)) && near(i - 2, i - 1) && near(i - 1, i)
      && PHONE_CUES.has(word(s, parts[i - 2]!));
  };
  const kept = new Set<number>();
  const frequencies: number[] = [];
  const dates: Span[] = [];
  const monthDates: Span[] = [];
  const times: Span[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]!.written) {
      if (!MONTHS.has(word(s, parts[i]!))) continue;
      if (isDay(i + 1) && MONTH_DAY_GAP.test(flat(gap(i, i + 1)))) {
        monthDates.push({ first: i + 1, last: isYear(i + 2) && YEAR_GAP.test(flat(gap(i + 1, i + 2))) ? i + 2 : i + 1, isTime: false });
      } else if (isDay(i - 1) && DAY_MONTH_GAP.test(flat(gap(i - 1, i)))) {
        monthDates.push({ first: i - 1, last: isYear(i + 1) && YEAR_GAP.test(flat(gap(i, i + 1))) ? i + 1 : i - 1, isTime: false });
      }
      continue;
    }
    if (i + 2 < parts.length && written(i + 1) && written(i + 2) && isDate(s, parts[i]!, parts[i + 1]!, parts[i + 2]!) && !sameSeparatorNeighbour(s, parts, i, i + 2)) {
      dates.push({ first: i, last: i + 2, isTime: false });
    }
    // A month and day with a slash (11/19 or 19/11), with no other slash group on either side.
    if (written(i + 1) && gap(i, i + 1) === "/" && len(i) <= 2 && len(i + 1) <= 2 && !(written(i + 2) && gap(i + 1, i + 2) === "/") && !(i > 0 && parts[i - 1]!.digits > 0 && gap(i - 1, i) === "/")) {
      const x = value(i) ?? 0;
      const y = value(i + 1) ?? 0;
      if ((between(x, 1, 12) && between(y, 1, 31)) || (between(x, 1, 31) && between(y, 1, 12))) dates.push({ first: i, last: i + 1, isTime: false });
    }
    if (written(i + 1) && gap(i, i + 1) === ":" && len(i) <= 2 && len(i + 1) === 2 && (value(i) ?? 99) <= 23 && (value(i + 1) ?? 99) <= 59) {
      times.push({ first: i, last: i + 1, isTime: true });
    }
    // A "+" right before the first number makes the pair a phone number (+44.2071, -23.4567), not coordinates.
    if (degrees(i, i + 1, 90) && degrees(i + 2, i + 3, 180) && COORDINATE_GAP.test(flat(gap(i + 1, i + 2), true)) && !(parts[i]!.start > 0 && s[parts[i]!.start - 1] === "+")
      && !cueBefore(i)) {
      for (const j of range(i, i + 3)) kept.add(j);
    }
    // A radio frequency candidate (146.520, 155.160): 25 to 999 MHz with no leading zero, a full stop, exactly 3 digits,
    // not part of a dotted chain (404.555.0142) and not after a "+". Kept below only in a run of frequencies.
    if (written(i + 1) && gap(i, i + 1) === "." && len(i) <= 3 && len(i + 1) === 3 && isAsciiNumber(text(i)) && isAsciiNumber(text(i + 1))
      && !text(i).startsWith("0") && between(Number(text(i)), 25, 999)
      && !(i > 0 && parts[i - 1]!.digits > 0 && gap(i - 1, i) === ".") && !(written(i + 2) && gap(i + 1, i + 2) === ".")
      && !(parts[i]!.start > 0 && s[parts[i]!.start - 1] === "+")) {
      frequencies.push(i);
    }
    if (len(i) === 5 && written(i + 1) && gap(i, i + 1) === "-" && len(i + 1) === 4 && i > 0 && !parts[i - 1]!.written && STATES.has(text(i - 1)) && gap(i - 1, i) === " ") {
      kept.add(i);
      kept.add(i + 1);
    }
  }
  // A frequency is search information only in a run made of nothing but frequencies: joined anywhere in its run to other
  // digits (404.555-0142 #123, 404.555 0.142 1234567) it could be part of a phone number, so it goes with the run.
  // Candidates with a joined neighbour outside the set drop out until none does.
  let live = frequencies;
  for (;;) {
    const inFrequency = new Set(live.flatMap((i) => [i, i + 1]));
    const alone = (inside: number, outside: number) =>
      outside < 0 || outside >= parts.length || inFrequency.has(outside)
      || !joins(s, parts[Math.min(inside, outside)]!, parts[Math.max(inside, outside)]!);
    const next = live.filter((i) => alone(i, i - 1) && alone(i + 1, i + 2));
    if (next.length === live.length) break;
    live = next;
  }
  for (const i of live) {
    kept.add(i);
    kept.add(i + 1);
  }
  // Dates are found in order, so a date can overlap only the one before or after it in the list; overlaps cancel.
  const writtenDates = dates.filter((d, k) => !(k > 0 && dates[k - 1]!.last >= d.first) && !(k + 1 < dates.length && dates[k + 1]!.first <= d.last));
  let spans: Span[] = [...writtenDates, ...monthDates, ...times];
  const digitsOf = (r: Span) => range(r.first, r.last).filter((i) => parts[i]!.written);
  const found = new Set([...kept, ...spans.flatMap(digitsOf)]);
  // A time joined before its hour to digits that are not search information could be a phone number's last four
  // digits (1 404 555 01:42), so it is dropped and goes with them; a date then a time keep each other.
  const glued = new Set<number>();
  for (;;) {
    const inDates = new Set(spans.filter((r) => !r.isTime).flatMap(digitsOf));
    const joinedOutside = (inside: number, outside: number) =>
      outside >= 0 && outside < parts.length && joins(s, parts[Math.min(inside, outside)]!, parts[Math.max(inside, outside)]!) && !inDates.has(outside);
    const drop = spans.filter((r) => r.isTime && joinedOutside(r.first, r.first - 1));
    if (drop.length === 0) break;
    spans = spans.filter((r) => !drop.includes(r));
    for (const r of drop) glued.add(r.first);
  }
  return { found, kept: new Set([...kept, ...spans.flatMap(digitsOf)]), glued };
}

function between(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

/** Whether digits join the date at parts[first..last] by the date's own separator, on either side. */
function sameSeparatorNeighbour(s: string, parts: Part[], first: number, last: number): boolean {
  const sep = s.substring(parts[first]!.end, parts[first + 1]!.start);
  const before = first > 0 && parts[first - 1]!.digits > 0 && s.substring(parts[first - 1]!.end, parts[first]!.start) === sep;
  const after = last + 1 < parts.length && parts[last + 1]!.digits > 0 && s.substring(parts[last]!.end, parts[last + 1]!.start) === sep;
  return before || after;
}

function partsOf(s: string): Part[] {
  const parts: Part[] = [];
  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i)!;
    if (isDigit(cp)) {
      let j = i;
      let n = 0;
      while (j < s.length && isDigit(s.codePointAt(j)!)) {
        j += charCount(s.codePointAt(j)!);
        n++;
      }
      parts.push({ start: i, end: j, digits: n, written: true, alone: false });
      i = j;
    } else if (isLetter(cp)) {
      let j = i;
      // A word stops at a Chinese numeral, which is a digit here.
      while (j < s.length && isLetter(s.codePointAt(j)!) && !isDigit(s.codePointAt(j)!)) j += charCount(s.codePointAt(j)!);
      parts.push({ start: i, end: j, digits: DIGIT_WORDS.has(s.substring(i, j).toLowerCase()) ? 1 : 0, written: false, alone: false });
      i = j;
    } else {
      i += charCount(cp);
    }
  }
  return parts;
}

/**
 * Three written digit groups joined by the same one of / - . or a dash that read as a date: year-month-day (a 4-digit
 * year from 1900 to 2100), or month and day in either order then a 2-digit year or such a 4-digit year.
 */
function isDate(s: string, a: Part, b: Part, c: Part): boolean {
  const gap1 = s.substring(a.end, b.start);
  const gap2 = s.substring(b.end, c.start);
  if (gap1.length !== 1 || gap1 !== gap2 || (!"/-.".includes(gap1) && !DASHES.includes(gap1))) return false;
  const number = (p: Part): number | null => {
    const t = s.substring(p.start, p.end);
    return isAsciiNumber(t) ? Number(t) : null;
  };
  const x = number(a);
  const y = number(b);
  const z = number(c);
  if (x === null || y === null || z === null) return false;
  const lx = a.end - a.start;
  const ly = b.end - b.start;
  const lz = c.end - c.start;
  if (lx === 4) return between(x, 1900, 2100) && ly <= 2 && lz <= 2 && between(y, 1, 12) && between(z, 1, 31);
  if (lx > 2 || ly > 2 || !(lz === 2 || (lz === 4 && between(z, 1900, 2100)))) return false;
  return between(x, 1, 31) && between(y, 1, 31) && (between(x, 1, 12) || between(y, 1, 12));
}

// The marks that never join a number: a time (14:03), a percent (45%) and a degree (33.7490°) are search information.
// Every other mark joins, so 404|555|0142 and 404;555;0142 are removed; a coordinate pair or a radio frequency between
// such marks stays through its own span (searchSpans).
const NOT_A_SEPARATOR = ":%°";

/**
 * What may sit between the parts of one number, read after flat(): anything but a mark in NOT_A_SEPARATOR, any amount
 * of it. A gap holds no letter or digit (those are parts), so every space, line break, punctuation mark and symbol
 * joins: - . , ( ) / and the dashes, and also a middle dot, a hyphenation point, a bullet, an underscore, a star or a
 * bracket.
 */
function onlySeparators(s: string): boolean {
  return ![...flat(s)].some((c) => NOT_A_SEPARATOR.includes(c));
}

/**
 * A gap as read: marks and format characters dropped, each line break with any indent after it made one "\n", and
 * every other space " ". With keepIndent the indent stays as spaces.
 */
function flat(gap: string, keepIndent = false): string {
  const visible = [...gap].filter((c) => !MARK_OR_FORMAT.test(c)).join("");
  const broken = visible.replace(keepIndent ? BREAK : LINE_BREAK, "\n");
  // By UTF-16 unit, as Kotlin maps the chars of a String.
  return broken
    .split("")
    .map((c) => (c !== "\n" && KOTLIN_SPACE.test(c) ? " " : c))
    .join("");
}
