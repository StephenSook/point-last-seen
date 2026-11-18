import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Dev harness pages record no consent and skip the cloud pause, so none of them may build a cloud model:
// a harness that did would send whatever bytes it is handed to the configured project's model.
const CLOUD_BUILDERS = ["clipCloudGenerator", "wordingGenerator", "sightingTemplateGenerator", "photoTemplateGenerator"];
const DIRS = ["./", "../extras/harness/"];

describe("dev harness pages", () => {
  it("never build a cloud model", () => {
    const offenders: string[] = [];
    let walked = 0;
    for (const dir of DIRS) {
      const base = new URL(dir, import.meta.url);
      for (const name of readdirSync(base)) {
        if (!/\.tsx?$/.test(name) || name.endsWith(".test.ts")) continue;
        walked += 1;
        const text = readFileSync(new URL(name, base), "utf8");
        for (const b of CLOUD_BUILDERS) if (new RegExp(`\\b${b}\\b`).test(text)) offenders.push(`${dir}${name}: ${b}`);
      }
    }
    expect(walked).toBeGreaterThanOrEqual(10);
    expect(offenders).toEqual([]);
  });
});
