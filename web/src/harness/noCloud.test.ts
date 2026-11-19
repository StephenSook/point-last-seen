import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Dev harness pages record no consent and skip the cloud pause, so none of them may build a cloud model:
// a harness that did would send whatever bytes it is handed to the configured project's model.
const CLOUD_BUILDERS = ["clipCloudGenerator", "wordingGenerator", "sightingTemplateGenerator", "photoTemplateGenerator"];
const SDK_BUILDERS = ["getGenerativeModel", "getTemplateGenerativeModel"];
const DIRS = ["./", "../extras/harness/"];

const word = (w: string) => new RegExp(`\\b${w}\\b`);

/**
 * How a page loads modules, read from its syntax tree (so comments and template strings cannot hide one):
 * whether it loads the SDK in any form (import, re-export, dynamic import) and whether it has a dynamic import
 * whose module name is computed, which the scan could not follow.
 */
function imports(text: string): { sdk: boolean; computed: boolean } {
  const sf = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let sdk = false;
  let computed = false;
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      if (n.moduleSpecifier.text === "firebase/ai") sdk = true;
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        if (arg.text === "firebase/ai") sdk = true;
      } else computed = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { sdk, computed };
}

/** What a page does that a dev page must not: the app's cloud builders, or the SDK's model builders. */
export function cloudOffenders(text: string): string[] {
  const out = CLOUD_BUILDERS.filter((b) => word(b).test(text));
  const loads = imports(text);
  // Loading the SDK only for getAI (to hand an instance to an on-device builder) is fine.
  if (loads.sdk) out.push(...SDK_BUILDERS.filter((b) => word(b).test(text)).map((b) => `firebase/ai ${b}`));
  if (loads.computed) out.push("dynamic import of a computed module");
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
  it("parses imports, so comments and template strings do not hide one", () => {
    expect(cloudOffenders(`const m = await import(/* lazy */ "firebase/ai");\nconst build = m.getGenerativeModel;`)).toEqual(["firebase/ai getGenerativeModel"]);
    expect(cloudOffenders("const m = await import(`firebase/ai`);\nconst build = m.getTemplateGenerativeModel;")).toEqual(["firebase/ai getTemplateGenerativeModel"]);
    expect(cloudOffenders(`export { getGenerativeModel } from "firebase/ai";`)).toEqual(["firebase/ai getGenerativeModel"]);
  });
  it("flags a dynamic import whose module name is computed: a dev page has no reason for one", () => {
    expect(cloudOffenders(`const name = "firebase/" + "ai";\nconst m = await import(name);`)).toEqual(["dynamic import of a computed module"]);
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
