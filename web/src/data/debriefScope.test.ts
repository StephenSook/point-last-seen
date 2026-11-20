import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A debrief is a note for the team after a search, never a coverage claim: no code that builds the map, the
// probabilities or the plans may read one. Only these files may name debriefs at all.
const ALLOWED = new Set([
  "data/debriefs.ts",
  "data/debriefs.test.ts",
  "data/debriefScope.test.ts",
  "command/DebriefSection.tsx",
  "command/CommandPost.tsx",
  "harness/debriefHarness.tsx",
]);

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("debrief scope", () => {
  it("no file outside the debrief section and its data module reads debriefs", () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(100);
    const outside = files.map((f) => relative(SRC, f)).filter((rel) => !ALLOWED.has(rel) && /debrief/i.test(readFileSync(join(SRC, rel), "utf8")));
    expect(outside).toEqual([]);
  });
});
