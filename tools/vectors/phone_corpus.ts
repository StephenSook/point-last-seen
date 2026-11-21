// The shared phone-number corpus (shared/test-vectors/phone-numbers-corpus.json): every shared case's input, then a
// fixed-seed set of generated notes, each with the web rule's output (web/src/data/phoneNumbers.ts). Every platform
// runs its own rule over the inputs and must give the stored outputs, so a port that drifts fails its own CI.
// The generated notes lean on what ports get wrong: runs of times beside cues, digits, spoken digits, months and
// street names, and characters that sit between code points and what a person sees (combining marks, variation
// selectors, keycaps, joiner sequences, emoji modifiers). Write or check it with tools/vectors/phone_corpus_cli.ts.

import { REPLACEMENT, removePhoneNumbers } from "../../web/src/data/phoneNumbers";

export const SEED = 20261121;
export const GENERATED = 9_000;

export type Corpus = { rule: string; replacement: string; rows: { input: string; output: string }[] };
type Vectors = { mustRemove: { input: string }[]; mustKeep: { input: string }[]; exact: { input: string }[] };

/** mulberry32: a small, well-mixed generator, the same on every machine. */
function random(seed: number): (n: number) => number {
  let s = seed | 0;
  return (n) => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
}

const CUES = ["Call", "call", "Text", "Reach me at", "Phone", "cell", "number", "Llame al", "teléfono", "#", "# "];
// Characters a person cannot see, or that join with the one before: each has broken a port at least once.
const UNSEEN = ["͏", "️", "︎", "‍", "​", " ", "́", " "];
const PIECES = [
  "Seen ", "at ", "me ", "tonight", "by the creek", "four ", "oh ", "cinco ", "double ", "triple ", "四", "一二",
  "٤", "४", "４", "⁴", "²", "①", "May ", "14 May ", " May 2026 ", "Nov 19 ", "67th Ave ", "GA 30301-1234 ",
  "11/19/2026 ", "33.7866, -84.3733 ", "146.520 ", "404 555 0142", "4045550142", "+1 ", "(", ")", "\t", "\n", "\r\n", ", ", "-", ".", ":",
  "%", "", "#️⃣", "4️⃣", "👨‍👩‍👧", "👍🏽",
  "é", "Ca͏ll ", "Te͏xt ", "2️", "5́",
];

function note(r: (n: number) => number): string {
  const time = () => {
    const m = r(1500);
    const h = Math.floor(m / 60);
    return `${r(3) === 0 && h < 10 ? `0${h}` : h}:${String(m % 60).padStart(2, "0")}`;
  };
  const run = () => {
    const ms = Array.from({ length: 2 + r(3) }, () => r(1440));
    if (r(2)) ms.sort((a, b) => a - b);
    return ms.map((m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`).join([" ", ", ", ","][r(3)]!);
  };
  const piece = () => {
    const k = r(12);
    if (k < 3) return run();
    if (k < 4) return time();
    if (k < 5) return String(r(10 ** (1 + r(5))));
    if (k < 6) return `${CUES[r(CUES.length)]!} `;
    if (k < 7) return UNSEEN[r(UNSEEN.length)]!;
    return PIECES[r(PIECES.length)]!;
  };
  let out = "";
  for (let i = 1 + r(4); i > 0; i--) out += piece() + (r(2) ? " " : "");
  return out;
}

/** The corpus for the shared cases and the current web rule, whose file hash is `rule`. */
export function build(vectors: Vectors, rule: string): Corpus {
  const shared = [...vectors.mustRemove, ...vectors.mustKeep, ...vectors.exact].map((c) => c.input);
  const r = random(SEED);
  const generated = Array.from({ length: GENERATED }, () => note(r));
  return { rule, replacement: REPLACEMENT, rows: [...shared, ...generated].map((input) => ({ input, output: removePhoneNumbers(input) })) };
}

/** One row per line, so a change shows as the rows it touched. */
export function serialize(c: Corpus): string {
  const rows = c.rows.map((x) => `  ${JSON.stringify(x)}`).join(",\n");
  return `{\n "rule": ${JSON.stringify(c.rule)},\n "replacement": ${JSON.stringify(c.replacement)},\n "rows": [\n${rows}\n ]\n}\n`;
}
