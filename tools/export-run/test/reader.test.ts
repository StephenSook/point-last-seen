// What the exporter writes must pass the judge replay reader's own full check (web/src/extras/replay), not only the
// exporter's copy of its rules: this is the file the judge page loads from /evidence/published-run.json.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromPublishedRun } from "../../../web/src/extras/replay/replayData";
import { checkRun } from "../src/check";
import { toPublishedRun } from "../src/transform";
import { meta, rawDrill } from "./fixtures";

describe("an exported run and the judge replay reader", () => {
  it("passes the reader's full check, and the exporter's own", () => {
    const run = toPublishedRun(rawDrill(), meta);
    expect(checkRun(run)).toEqual([]);
    expect(fromPublishedRun(run as never)).toMatchObject({ ok: true });
  });
  it("is refused by the reader when it carries a field the contract lacks, so the pass above means something", () => {
    const run = toPublishedRun(rawDrill(), meta);
    const bad = { ...run, incident: { ...run.incident, joinCodeHash: "f".repeat(64) } };
    expect(fromPublishedRun(bad as never)).not.toMatchObject({ ok: true });
  });
});

// Before publishing a real export: PLS_RUN_FILE=<file> npx vitest run --root tools/export-run test/reader.test.ts
const file = process.env.PLS_RUN_FILE;
if (file) {
  describe(`the run file ${file}`, () => {
    it("passes the reader's full check and the exporter's own", () => {
      const run = JSON.parse(readFileSync(file, "utf8"));
      expect(checkRun(run)).toEqual([]);
      expect(fromPublishedRun(run)).toMatchObject({ ok: true });
    });
  });
}
