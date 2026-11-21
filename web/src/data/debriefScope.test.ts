import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The paper debrief sheet: these print an empty form for teams (and its SAMPLE). They may name debriefs, and the
// second test holds that none of them reads a debrief document.
const PAPER_SHEET = [
  "extras/debrief/debriefSheet.ts",
  "extras/debrief/debriefSheet.test.ts",
  "extras/debrief/DebriefSheets.tsx",
  "extras/print/PrintSession.tsx",
  "extras/ExtrasDock.tsx",
];

// The model client builds the sheet's on-device read. It may name the sheet, and like the sheet's files it never
// reads a stored debrief.
const MODEL_CLIENT = ["ai/client.ts", "ai/client.test.ts"];

// A debrief is a note for the team after a search, never a coverage claim: no code that builds the map, the
// probabilities or the plans may read one. Only these files may name debriefs at all.
const ALLOWED = new Set([
  "data/debriefs.ts",
  "data/debriefs.test.ts",
  "data/debriefScope.test.ts",
  "command/DebriefSection.tsx",
  "command/CommandPost.tsx",
  "harness/debriefHarness.tsx",
  // The paper sheet's on-device read: it turns a photo into the debrief form's boxes, and saves nothing itself.
  "ai/debriefSheetRead.ts",
  "ai/debriefSheetRead.test.ts",
  ...PAPER_SHEET,
  ...MODEL_CLIENT,
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

  it("the paper debrief sheet's files and the model client never import the debrief data module or Firestore, nor name the collection", () => {
    for (const rel of [...PAPER_SHEET, ...MODEL_CLIENT]) {
      const code = readFileSync(join(SRC, rel), "utf8");
      // Nor names the stored collection, so no other module that builds collection(..., "debriefs") is a way in.
      expect(code, rel).not.toMatch(/data\/debriefs|firebase\/firestore|["']debriefs["']/);
    }
    // The check can fail: the debrief section imports the data module, and the data module names the collection.
    expect(readFileSync(join(SRC, "command/DebriefSection.tsx"), "utf8")).toMatch(/data\/debriefs/);
    expect(readFileSync(join(SRC, "data/debriefs.ts"), "utf8")).toMatch(/["']debriefs["']/);
  });
});
