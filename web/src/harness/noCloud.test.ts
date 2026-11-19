import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Dev harness pages record no consent and skip the cloud pause, so none of them may build a cloud model:
// a harness that did would send whatever bytes it is handed to the configured project's model.
const CLOUD_BUILDERS = ["clipCloudGenerator", "wordingGenerator", "sightingTemplateGenerator", "photoTemplateGenerator"];
const SDK_BUILDERS = ["getGenerativeModel", "getTemplateGenerativeModel"];
const DIRS = ["./", "../extras/harness/"];

const word = (w: string) => new RegExp(`\\b${w}\\b`);
// Any form of loading the SDK: a named, namespace or default import, a re-export, or a dynamic import.
const LOADS_SDK = /(?:from\s*["']firebase\/ai["'])|(?:import\s*\(\s*["']firebase\/ai["']\s*\))/;

/** What a page does that a dev page must not: the app's cloud builders, or the SDK's model builders. */
export function cloudOffenders(text: string): string[] {
  const out = CLOUD_BUILDERS.filter((b) => word(b).test(text));
  // Loading the SDK only for getAI (to hand an instance to an on-device builder) is fine.
  if (LOADS_SDK.test(text)) out.push(...SDK_BUILDERS.filter((b) => word(b).test(text)).map((b) => `firebase/ai ${b}`));
  return out;
}

describe("the dev-page scan", () => {
  it("flags each way of reaching a model builder", () => {
    expect(cloudOffenders(`import { clipCloudGenerator } from "../ai/client";`)).toEqual(["clipCloudGenerator"]);
    expect(cloudOffenders(`import { getGenerativeModel } from "firebase/ai";`)).toEqual(["firebase/ai getGenerativeModel"]);
    expect(cloudOffenders(`import * as sdk from "firebase/ai";\nconst build = sdk.getGenerativeModel;`)).toEqual(["firebase/ai getGenerativeModel"]);
    expect(cloudOffenders(`const { getTemplateGenerativeModel } = await import("firebase/ai");`)).toEqual(["firebase/ai getTemplateGenerativeModel"]);
    expect(cloudOffenders(`const m = await import( 'firebase/ai' );\nconst build = m.getGenerativeModel;`)).toEqual(["firebase/ai getGenerativeModel"]);
  });
  it("lets a page load the SDK for getAI alone", () => {
    expect(cloudOffenders(`import { getAI, GoogleAIBackend } from "firebase/ai";\nconst ai = getAI(app, { backend: new GoogleAIBackend() });`)).toEqual([]);
  });
});

describe("dev harness pages", () => {
  it("never build a cloud model", () => {
    const offenders: string[] = [];
    let walked = 0;
    for (const dir of DIRS) {
      const base = new URL(dir, import.meta.url);
      for (const name of readdirSync(base)) {
        if (!/\.tsx?$/.test(name) || name.endsWith(".test.ts")) continue;
        walked += 1;
        offenders.push(...cloudOffenders(readFileSync(new URL(name, base), "utf8")).map((o) => `${dir}${name}: ${o}`));
      }
    }
    expect(walked).toBeGreaterThanOrEqual(10);
    expect(offenders).toEqual([]);
  });
});
