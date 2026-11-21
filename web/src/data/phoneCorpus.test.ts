// The shared phone-number corpus on the web rule. The file must be exactly what tools/vectors/phone_corpus.ts writes
// for the current rule (so nobody edits rows by hand or forgets to regenerate after a rule change), and every stored
// output must be what removePhoneNumbers gives for its input. Android and the iPhone run the same rows.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build, serialize, type Corpus } from "../../../tools/vectors/phone_corpus";
import { REPLACEMENT, removePhoneNumbers } from "./phoneNumbers";

const at = (path: string) => new URL(`../../../${path}`, import.meta.url);
const text = readFileSync(at("shared/test-vectors/phone-numbers-corpus.json"), "utf8");
const corpus = JSON.parse(text) as Corpus;
const rule = `sha256:${createHash("sha256").update(readFileSync(at("web/src/data/phoneNumbers.ts"))).digest("hex")}`;

/** Every row whose stored output the rule does not give, all of them, never stopping at the first. */
function mismatches(rows: Corpus["rows"]): string[] {
  return rows.flatMap((r, i) => {
    const out = removePhoneNumbers(r.input);
    return out === r.output ? [] : [`row ${i}: ${JSON.stringify(r.input)} gives ${JSON.stringify(out)}, stored ${JSON.stringify(r.output)}`];
  });
}

describe("the shared phone-number corpus", () => {
  it("is exactly what the generator writes for this rule", () => {
    expect(corpus.rule, "the rule changed: run npx tsx tools/vectors/phone_corpus_cli.ts --write").toBe(rule);
    expect(text === serialize(build(JSON.parse(readFileSync(at("shared/test-vectors/phone-numbers.json"), "utf8")), rule))).toBe(true);
  });

  it("holds at least 9,000 rows, with the shared replacement", () => {
    expect(corpus.rows.length).toBeGreaterThanOrEqual(9_000);
    expect(corpus.replacement).toBe(REPLACEMENT);
  });

  it("gives the stored output for every row on the web rule", () => {
    const bad = mismatches(corpus.rows);
    expect(bad.length, bad.slice(0, 5).join("\n")).toBe(0);
  });

  it("the row check catches a stored output the rule does not give", () => {
    const planted = corpus.rows.slice(0, 50).map((r, i) => (i === 7 ? { ...r, output: `${r.output} x` } : r));
    expect(mismatches(planted)).toHaveLength(1);
  });

  it("the shared README names this file's SHA-256", () => {
    const hash = createHash("sha256").update(text).digest("hex");
    expect(readFileSync(at("shared/test-vectors/README.md"), "utf8")).toContain(hash);
  });
});
