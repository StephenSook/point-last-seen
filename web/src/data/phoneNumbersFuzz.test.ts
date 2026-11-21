// A fixed-seed differential check of the run-of-times step (removePhoneNumbers) against the shared rule alone
// (removeByRule). The rule for which runs may stay is written out again below from shared/test-vectors/README.md, in
// its own form (tokens and gaps, not the rule's parts), so a slip in either one shows up as a disagreement.
//
// Four properties, over generated notes:
//   P1 a note with no run of times, or one NFKC changes, comes out exactly as the shared rule gives it;
//   P2 outside the runs the README lets stay, no more digits survive than the shared rule leaves;
//   P3 a phone number planted in the note survives only where the shared rule leaves it too, or where it is itself a
//      run the README lets stay (the accepted gap: rising times with no cue);
//   P4 every run the README lets stay does stay.
// Three deliberately leaky stand-ins prove P1 and P3 can fail.

import { describe, expect, it } from "vitest";
import { REPLACEMENT, removeByRule, removePhoneNumbers } from "./phoneNumbers";

const RUN = /(?<!\p{N}[^\p{L}\p{N}]*)(?:[01]?\d|2[0-3]):[0-5]\d(?:[ ,]+(?:[01]?\d|2[0-3]):[0-5]\d)+(?![^\p{L}\p{N}]*\p{N})/gu;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const SPOKEN: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
};
const CHINESE = "〇零一二三四五六七八九";
const CUES = new Set(["call", "tel", "phone", "cell", "mobile", "number", "llame", "llamar", "teléfono", "telefono", "celular", "número", "numero", "text", "reach"]);
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
    for (;;) {
      if (j >= s.length) break;
      const d = String.fromCodePoint(s.codePointAt(j)!);
      if ((kind === "d" ? isDigitChar(d) : isLetterChar(d)) === false) break;
      j += d.length;
    }
    const text = s.slice(i, j);
    out.push({ text, start: i, end: j, digitish: kind === "d" || SPOKEN[text.toLowerCase()] !== undefined });
    i = j;
  }
  return out;
}

const breaks = (gap: string) => /[:%°]/.test(gap);

/** Whether the README lets this run stay: nothing joins it, its times rise, and no cue stands before it. */
function mayStay(s: string, start: number, end: number, run: string): boolean {
  const ts = tokens(s);
  const before = ts.filter((t) => t.end <= start);
  const after = ts.filter((t) => t.start >= end);
  const prev = before.at(-1);
  if (prev && !breaks(s.slice(prev.end, start))) {
    if (prev.digitish || REPEAT_WORDS.has(prev.text.toLowerCase())) return false;
  }
  const next = after[0];
  if (next && !breaks(s.slice(end, next.start))) {
    if (next.digitish) return false;
    const afterNext = after[1];
    if (REPEAT_WORDS.has(next.text.toLowerCase()) && afterNext?.digitish && !breaks(s.slice(next.end, afterNext.start))) return false;
  }
  let k = before.length - 1;
  for (let n = 0; n < 3 && k >= 0 && !before[k]!.digitish; n++, k--) {
    if (CUES.has(before[k]!.text.toLowerCase())) return false;
  }
  if (s.slice(k >= 0 ? before[k]!.end : 0, start).includes("#")) return false;
  const minutes = [...run.matchAll(/(\d+):(\d+)/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
  return minutes.every((v, i) => i === 0 || v >= minutes[i - 1]!);
}

/** Every digit in the text, in order: written digits, Chinese numerals and spoken digit words. */
function digitStream(t: string): string {
  let out = "";
  for (const tok of tokens(t.normalize("NFKC"))) {
    const spoken = SPOKEN[tok.text.toLowerCase()];
    if (spoken !== undefined) out += spoken;
    else if (/\p{N}|[〇零一二三四五六七八九幺]/u.test(tok.text)) {
      for (const c of tok.text) {
        const z = CHINESE.indexOf(c);
        out += c === "幺" ? "1" : z >= 0 ? String(Math.max(0, z - 1)) : /[0-9]/.test(c) ? c : "?";
      }
    }
  }
  return out;
}

let seed = 0;
const rnd = (n: number) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % n;
};
const time = () => `${rnd(30)}:${String(rnd(70)).padStart(2, "0")}`;
const group = () => String(rnd(10 ** (1 + rnd(4))));
const NOISE = ["Call ", "call ", "Reach ", "me ", "at ", "Seen ", "Text ", "four ", "five ", "oh ", "double ", "triple ", "四", "#", "(", ")",
  "\t", "\n", "\r\n", " ", ", ", ",", "-", ".", "/", ":", "%", "", "GA ", "11/19/2026 ", "Nov ", "tonight", "a ", "67th Ave ", "４"];
const noise = (len: number) => {
  let y = "";
  for (let k = 0; k < len; k++) {
    const r = rnd(10);
    y += r < 2 ? time() : r < 4 ? group() : NOISE[rnd(NOISE.length)]!;
    if (rnd(2) === 0) y += [" ", ", ", "\t", "("][rnd(4)];
  }
  return y;
};
const run = () => {
  const ts: string[] = [];
  for (let i = 2 + rnd(3); i > 0; i--) ts.push(`${rnd(24)}:${String(rnd(60)).padStart(2, "0")}`);
  return ts.join([" ", ", ", ","][rnd(3)]);
};
/** A ten-digit number (or eleven, with a spoken digit in front) in one of five written forms, and its digits. */
const planted = (): { text: string; digits: string } => {
  const d = Array.from({ length: 10 }, () => rnd(10));
  const s = d.join("");
  const asTimes = () => {
    const h1 = rnd(10), m1 = `${rnd(6)}${rnd(10)}`, h2 = rnd(10), m2 = `${rnd(6)}${rnd(10)}`, h3 = String(rnd(24)).padStart(2, "0"), m3 = `${rnd(6)}${rnd(10)}`;
    const sep = [" ", ", "][rnd(2)];
    return { text: `${h1}:${m1}${sep}${h2}:${m2}${sep}${h3}:${m3}`, digits: `${h1}${m1}${h2}${m2}${h3}${m3}` };
  };
  switch (rnd(5)) {
    case 0: return { text: `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`, digits: s };
    case 1: return { text: `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`, digits: s };
    case 2: return { text: d.map((n) => WORDS[n]).join(" "), digits: s };
    case 3: return asTimes();
    default: {
      const a = rnd(10);
      const t = asTimes();
      return { text: `${WORDS[a]} ${t.text}`, digits: `${a}${t.digits}` };
    }
  }
};
const CONTEXT = ["", "Call ", "Reach me at ", "Text her on ", "# ", "Seen ", "Llame al ", "Possible times "];

type Counts = { p1: number; p2: number; p3: number; p4: number; withRun: number };

/** Runs the four properties over n generated notes with a fixed seed, for the step or a stand-in for it. */
function check(step: (t: string) => string, n: number): Counts {
  seed = 20261121;
  const c: Counts = { p1: 0, p2: 0, p3: 0, p4: 0, withRun: 0 };
  for (let i = 0; i < n; i++) {
    let x: string;
    let secret: { text: string; digits: string } | null = null;
    if (i % 3 === 0) x = noise(3 + rnd(9));
    else if (i % 3 === 1) x = noise(rnd(4)) + run() + noise(rnd(4));
    else {
      secret = planted();
      x = noise(rnd(3)) + CONTEXT[rnd(CONTEXT.length)]! + secret.text + (rnd(2) ? " tonight" : "") + noise(rnd(3));
    }
    const shared = removeByRule(x);
    const out = step(x);
    const runs = x.normalize("NFKC") === x ? [...x.matchAll(RUN)] : [];
    if (runs.length === 0) {
      if (out !== shared) c.p1++;
      continue;
    }
    c.withRun++;
    // Blank each run the README lets stay, in order, where the output keeps it.
    let blanked = "";
    let cursor = 0;
    for (const m of runs) {
      if (!mayStay(x, m.index, m.index + m[0].length, m[0])) continue;
      const at = out.indexOf(m[0], cursor);
      if (at < 0) {
        c.p4++;
        continue;
      }
      blanked += `${out.slice(cursor, at)}|`;
      cursor = at + m[0].length;
    }
    blanked += out.slice(cursor);
    if (digitStream(blanked).length > digitStream(shared).length) c.p2++;
    if (secret && digitStream(blanked).includes(secret.digits) && !digitStream(shared).includes(secret.digits)) c.p3++;
  }
  return c;
}

describe("removePhoneNumbers: the run-of-times step against the shared rule alone", () => {
  it("keeps every property over 90,000 generated notes", () => {
    const c = check(removePhoneNumbers, 90_000);
    expect(c.withRun).toBeGreaterThan(35_000);
    expect(c).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0, withRun: c.withRun });
  }, 60_000);

  it("flags a stand-in that keeps every note as written (P3)", () => {
    expect(check((t) => t, 9_000).p3).toBeGreaterThan(0);
  }, 60_000);

  it("flags a stand-in that keeps every run, joined or cued, and splits the note there (P3)", () => {
    const split = (t: string) => {
      let out = "";
      let from = 0;
      for (const m of t.matchAll(RUN)) {
        out += removeByRule(t.slice(from, m.index)) + m[0];
        from = m.index + m[0].length;
      }
      return out + removeByRule(t.slice(from));
    };
    expect(check(split, 9_000).p3).toBeGreaterThan(0);
  }, 60_000);

  it("flags a stand-in that drops a typed private-use character (P1)", () => {
    expect(check((t) => removePhoneNumbers(t).replaceAll("", ""), 9_000).p1).toBeGreaterThan(0);
  }, 60_000);

  it("the replacement carries no digit, so blanking a kept run hides nothing", () => {
    expect(digitStream(REPLACEMENT)).toBe("");
  });
});
