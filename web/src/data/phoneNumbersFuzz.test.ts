// A fixed-seed differential check of the run-of-times step (removePhoneNumbers). The step is written out again below
// from shared/test-vectors/README.md in its own form (tokens and gaps, not the rule's parts), with the shared rule
// (removeByRule) for the text between runs, and the two must agree byte for byte on every generated note: any leak,
// any over-removal and any moved text shows up as a difference, whatever its digit count.
//
// A second property asks the README itself: a phone number planted in a note survives only where the shared rule
// alone leaves it too, or where it lies wholly inside a run the README lets stay (the accepted gap: rising times, no
// cue). Three deliberately wrong stand-ins prove the first property can fail, and a looser README that the second can.

import { describe, expect, it } from "vitest";
import { REPLACEMENT, removeByRule, removePhoneNumbers } from "./phoneNumbers";

const RUN = /(?<!\p{N}[^\p{L}\p{N}]*)(?:[01]?\d|2[0-3]):[0-5]\d(?:[ ,]+(?:[01]?\d|2[0-3]):[0-5]\d)+(?![^\p{L}\p{N}]*\p{N})/gu;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const SPOKEN: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
};
const CHINESE = "〇零一二三四五六七八九";
const CUE_WORDS = ["call", "tel", "phone", "cell", "mobile", "number", "llame", "llamar", "teléfono", "telefono", "celular", "número", "numero", "text", "reach"];
const CUES = new Set(CUE_WORDS);
const REPEAT_WORDS = new Set(["double", "triple"]);

type Token = { text: string; start: number; end: number; digitish: boolean };

const isChinese = (c: string) => CHINESE.includes(c) || c === "幺";
const isDigitChar = (c: string) => /\p{N}/u.test(c) || isChinese(c);
const isLetterChar = (c: string) => /\p{L}/u.test(c) && !isChinese(c);

/** Maximal runs of digit characters (any script, Chinese numerals) and of letters, as the rule splits a note. */
function tokens(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = String.fromCodePoint(s.codePointAt(i)!);
    const kind = isDigitChar(c) ? "d" : isLetterChar(c) ? "l" : "";
    if (!kind) {
      i += c.length;
      continue;
    }
    let j = i;
    while (j < s.length) {
      const d = String.fromCodePoint(s.codePointAt(j)!);
      if (!(kind === "d" ? isDigitChar(d) : isLetterChar(d))) break;
      j += d.length;
    }
    const text = s.slice(i, j);
    out.push({ text, start: i, end: j, digitish: kind === "d" || SPOKEN[text.toLowerCase()] !== undefined });
    i = j;
  }
  return out;
}

// A colon, percent or degree sign in a gap keeps two numbers apart; every other gap joins them.
const breaks = (gap: string) => /[:%°]/.test(gap);

/** What the README does with a run: leave it to the shared rule, keep it whole, or replace it whole. */
function decide(s: string, ts: Token[], start: number, end: number, run: string, loose: boolean): "rule" | "keep" | "remove" {
  // The run must begin and end on token edges (a Chinese numeral against it makes one token with its digits).
  if (!ts.some((t) => t.start === start) || !ts.some((t) => t.end === end)) return "rule";
  const before = ts.filter((t) => t.end <= start);
  const after = ts.filter((t) => t.start >= end);
  const prev = before.at(-1);
  if (!loose && prev && !breaks(s.slice(prev.end, start)) && (prev.digitish || REPEAT_WORDS.has(prev.text.toLowerCase()))) return "rule";
  const next = after[0];
  if (!loose && next && !breaks(s.slice(end, next.start))) {
    if (next.digitish) return "rule";
    const then = after[1];
    if (REPEAT_WORDS.has(next.text.toLowerCase()) && then?.digitish && !breaks(s.slice(next.end, then.start))) return "rule";
  }
  // The three words before the run, reading past every token that carries digits (a double or triple counts as one
  // when digits follow it with no break).
  const counted = (i: number) => {
    const t = before[i]!;
    if (t.digitish) return true;
    const n = ts[ts.indexOf(t) + 1];
    return REPEAT_WORDS.has(t.text.toLowerCase()) && !!n && n.digitish && !breaks(s.slice(t.end, n.start));
  };
  let k = before.length - 1;
  let cued = false;
  for (let words = 0; k >= 0 && words < 3; k--) {
    if (counted(k)) continue;
    if (CUES.has(before[k]!.text.toLowerCase())) cued = true;
    words++;
  }
  if (s.slice(k >= 0 ? before[k]!.end : 0, start).includes("#")) cued = true;
  const minutes = [...run.matchAll(/(\d+):(\d+)/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
  const rising = minutes.every((v, i) => i === 0 || v >= minutes[i - 1]!);
  return rising && !cued ? "keep" : "remove";
}

/** The README's output for a note, in pieces, each kept run marked; loose ignores what joins a run (a wrong README). */
function expected(x: string, loose = false): { text: string; kept: boolean }[] {
  const folded = x.normalize("NFKC");
  if (folded !== x) return [{ text: removeByRule(folded), kept: false }];
  const ts = tokens(x);
  const out: { text: string; kept: boolean }[] = [];
  let from = 0;
  for (const m of x.matchAll(RUN)) {
    const verdict = decide(x, ts, m.index, m.index + m[0].length, m[0], loose);
    if (verdict === "rule") continue;
    out.push({ text: removeByRule(x.slice(from, m.index)), kept: false });
    out.push(verdict === "keep" ? { text: m[0], kept: true } : { text: REPLACEMENT, kept: false });
    from = m.index + m[0].length;
  }
  out.push({ text: removeByRule(x.slice(from)), kept: false });
  return out;
}

/** Every digit in the text, in order: ASCII digits, Chinese numerals and spoken digit words (other scripts as "?"). */
function digitStream(t: string): string {
  let out = "";
  for (const tok of tokens(t.normalize("NFKC"))) {
    const spoken = SPOKEN[tok.text.toLowerCase()];
    if (spoken !== undefined) out += spoken;
    else if (tok.digitish) {
      for (const c of tok.text) {
        const z = CHINESE.indexOf(c);
        out += c === "幺" ? "1" : z >= 0 ? String(Math.max(0, z - 1)) : /[0-9]/.test(c) ? c : "?";
      }
    }
  }
  return out;
}

// mulberry32: the low bits of a power-of-two LCG repeat in short cycles, which left some noise tokens never drawn.
let seed = 0;
const rnd = (n: number) => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) % n;
};
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)]!;
const time = () => `${rnd(30)}:${String(rnd(70)).padStart(2, "0")}`;
const group = () => String(rnd(10 ** (1 + rnd(4))));
const NOISE = ["Call ", "call ", "Reach ", "me ", "at ", "Seen ", "Text ", "four ", "five ", "oh ", "double ", "triple ", "四", "一二", "#", "(", ")",
  "\t", "\n", "\r\n", " ", ", ", ",", "-", ".", "/", ":", "%", "°", "", "​", "GA ", "11/19/2026 ", "Nov ", "tonight", "a ", "67th Ave ",
  "４", "⁴", "٤", "४", " "];
const noise = (len: number) => {
  let y = "";
  for (let k = 0; k < len; k++) {
    const r = rnd(10);
    y += r < 2 ? time() : r < 4 ? group() : pick(NOISE);
    if (rnd(2) === 0) y += pick([" ", ", ", "\t", "(", ": ", "% "]);
  }
  return y;
};
// Half the runs rise, so the keep path is exercised as often as the remove path.
const run = () => {
  const ms: number[] = [];
  for (let i = 2 + rnd(3); i > 0; i--) ms.push(rnd(24 * 60));
  if (rnd(2)) ms.sort((p, q) => p - q);
  const pad = () => rnd(3) === 0;
  return ms.map((m) => `${pad() ? String(Math.floor(m / 60)).padStart(2, "0") : Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`).join(pick([" ", ", ", ",", "  "]));
};
/** A phone number in one of seven written forms, and its digits in order. */
const planted = (): { text: string; digits: string } => {
  const d = Array.from({ length: 10 }, () => rnd(10));
  const s = d.join("");
  const asTimes = (count: number) => {
    const parts: string[] = [];
    let digits = "";
    for (let i = 0; i < count; i++) {
      const h = rnd(3) === 0 ? String(rnd(24)).padStart(2, "0") : String(rnd(10));
      const m = `${rnd(6)}${rnd(10)}`;
      parts.push(`${h}:${m}`);
      digits += h + m;
    }
    return { text: parts.join(pick([" ", ", ", ","])), digits };
  };
  switch (rnd(7)) {
    case 0: return { text: `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`, digits: s };
    case 1: return { text: `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`, digits: s };
    case 2: return { text: d.map((n) => WORDS[n]).join(" "), digits: s };
    case 3: return asTimes(2 + rnd(3));
    case 4: {
      const a = rnd(10);
      const t = asTimes(3);
      return { text: `${WORDS[a]}${pick([" ", ", ", "-"])}${t.text}`, digits: `${a}${t.digits}` };
    }
    case 5: {
      const a = rnd(10);
      const t = asTimes(3);
      return { text: `${t.text}${pick([" ", ", ", "-"])}${WORDS[a]}`, digits: `${t.digits}${a}` };
    }
    default: {
      const t = asTimes(2);
      const tail = `${rnd(10)}${rnd(10)}${rnd(10)}`;
      return { text: `${t.text} ${tail}`, digits: `${t.digits}${tail}` };
    }
  }
};
const cue = () => {
  const r = rnd(8);
  if (r === 0) return "";
  if (r === 1) return pick(["Seen ", "Possible times ", "Times were "]);
  if (r === 2) return "# ";
  const word = pick(CUE_WORDS);
  const between = pick([" ", " me at ", " her on ", ": ", " (", "\t", "\r\n", " - ", " one: ", " one two: ", " 5 at ", " double 5 at ", " x double 5 at "]);
  return `${rnd(2) ? word[0]!.toUpperCase() + word.slice(1) : word}${between}`;
};

type Counts = { differs: number; planted: number; withRun: number; kept: number; marked: number };

/** Runs both properties over n generated notes with a fixed seed, for the step or a stand-in for it. */
function check(step: (t: string) => string, n: number, loose = false): Counts {
  seed = 20261121;
  const c: Counts = { differs: 0, planted: 0, withRun: 0, kept: 0, marked: 0 };
  for (let i = 0; i < n; i++) {
    let x: string;
    let secret: { text: string; digits: string } | null = null;
    if (i % 3 === 0) x = noise(3 + rnd(9));
    else if (i % 3 === 1) x = noise(rnd(3)) + (rnd(2) ? cue() : pick(["", "Seen ", "Possible times ", "\n"])) + run() + noise(rnd(3));
    else {
      secret = planted();
      x = noise(rnd(3)) + cue() + secret.text + (rnd(2) ? " tonight" : "") + noise(rnd(3));
    }
    const pieces = expected(x, loose);
    if (step(x) !== pieces.map((p) => p.text).join("")) c.differs++;
    if (x.normalize("NFKC") === x && RUN.test(x)) c.withRun++;
    RUN.lastIndex = 0;
    if (pieces.some((p) => p.kept)) c.kept++;
    if (x.includes("\uE000")) c.marked++;
    if (secret && !pieces.some((p) => p.kept && p.text.includes(secret.text))) {
      const text = pieces.map((p) => p.text).join("");
      if (digitStream(text).includes(secret.digits) && !digitStream(removeByRule(x)).includes(secret.digits)) c.planted++;
    }
  }
  return c;
}

describe("removePhoneNumbers: the run-of-times step against the README, written again", () => {
  it("agrees byte for byte on 90,000 generated notes, and the README lets no planted number through", () => {
    const c = check(removePhoneNumbers, 90_000);
    // Measured with this seed: 25,557 notes hold a run and 4,762 keep one; a generator change that starves either fails here.
    expect(c.withRun).toBeGreaterThan(24_000);
    expect(c.kept).toBeGreaterThan(4_000);
    expect(c.marked).toBeGreaterThan(4_000);
    expect(c).toEqual({ differs: 0, planted: 0, withRun: c.withRun, kept: c.kept, marked: c.marked });
  }, 60_000);

  it("flags a stand-in that keeps every note as written", () => {
    expect(check((t) => t, 9_000).differs).toBeGreaterThan(0);
  }, 60_000);

  it("flags a stand-in that keeps every run, joined or cued, and splits the note there", () => {
    const split = (t: string) => {
      let out = "";
      let from = 0;
      for (const m of t.matchAll(RUN)) {
        out += removeByRule(t.slice(from, m.index)) + m[0];
        from = m.index + m[0].length;
      }
      return out + removeByRule(t.slice(from));
    };
    expect(check(split, 9_000).differs).toBeGreaterThan(0);
  }, 60_000);

  it("flags a stand-in that drops a typed private-use character", () => {
    expect(check((t) => removePhoneNumbers(t).replaceAll("", ""), 9_000).differs).toBeGreaterThan(0);
  }, 60_000);

  it("the planted-number check flags a looser README that ignores what joins a run", () => {
    expect(check((t) => expected(t, true).map((p) => p.text).join(""), 30_000, true).planted).toBeGreaterThan(0);
  }, 60_000);

  it("the replacement carries no digit, so blanking a kept run hides nothing", () => {
    expect(digitStream(REPLACEMENT)).toBe("");
  });
});
