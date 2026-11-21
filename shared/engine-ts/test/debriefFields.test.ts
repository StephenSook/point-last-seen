import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// What a team states on its debrief (coverage, clues, hazards) is a record for people, never an engine input: no
// engine source reads those fields, so no probability or coverage claim can come from them.
describe("debrief fields the team states", () => {
  it("are never read by the engine", () => {
    const dir = new URL("../src/", import.meta.url);
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "types.ts");
    expect(sources.length).toBeGreaterThan(10);
    for (const f of sources) {
      const s = readFileSync(new URL(f, dir), "utf8");
      // A read is a property access (d.clues or d["clues"]); the plain word "clues" in a comment is not one.
      const read = /\.(coverageStatedPct|clues|hazards|tookMinutes|didNotWork)\b|\[["'](coverageStatedPct|clues|hazards|tookMinutes|didNotWork)["']\]/;
      expect(read.exec(s)?.[0] ?? null, `${f} reads a debrief field`).toBeNull();
    }
  });

  it("the read check catches a property read (positive control)", () => {
    const read = /\.(coverageStatedPct|clues|hazards|tookMinutes|didNotWork)\b|\[["'](coverageStatedPct|clues|hazards|tookMinutes|didNotWork)["']\]/;
    expect(read.exec("const n = d.clues.length;")?.[0]).toBe(".clues");
    expect(read.exec('return d["hazards"];')?.[0]).toBe('["hazards"]');
    expect(read.exec("// the team's clues and hazards")).toBeNull();
  });

  it("are declared on the Debrief type, optional", () => {
    const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const block = types.slice(types.indexOf("export interface Debrief {"), types.indexOf("}", types.indexOf("export interface Debrief {")));
    for (const line of ["coverageStatedPct?: number;", "clues?: string;", "hazards?: string;"]) expect(block).toContain(line);
  });
});
