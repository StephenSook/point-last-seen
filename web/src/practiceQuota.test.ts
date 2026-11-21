import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// A practice search started by a check spends one of the 50 a UTC day the judges have (functions/src/judgeSession.ts).
// So a check may start one only in a test tagged @quota, which the live run skips unless PLS_ALLOW_QUOTA=1 (once per
// hosting deploy), or with the start callable answered inside the page (page.route), which never reaches the server.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

type Start = { file: string; line: number; ok: boolean; why: string };

const DECLARATION = /^[ \t]*test(?:\.only|\.skip|\.fixme)?\(\s*(["'`])((?:(?!\1).)*)\1\s*,\s*(\{[^}]*\})?/gm;
const TRIGGERS = [
  /name: "Try a practice search" \}\)\s*\.(?:click|dblclick|evaluate|press|tap|dispatchEvent)\(/g,
  // The start button held in a variable can be pressed anywhere later, so holding it counts as a start.
  /=\s*(?:page|practice)\.getByRole\("button", \{ name: "Try a practice search" \}\)\s*;/g,
  /\/startJudgeSession\b/g,
  /httpsCallable\([^)]*["']startJudgeSession["']/g,
];
const STUB = /page\.route\(\s*["']\*\*\/startJudgeSession["']/;

/** Every place in a source file that could start a practice search, and whether a quota tag or a stub covers it. */
function practiceStarts(file: string, source: string): Start[] {
  const tests = [...source.matchAll(DECLARATION)].map((m) => ({ at: m.index, options: m[3] ?? "" }));
  const lineOf = (at: number) => source.slice(0, at).split("\n").length;
  const starts: Start[] = [];
  for (const re of TRIGGERS) {
    for (const m of source.matchAll(re)) {
      const lineText = source.split("\n")[lineOf(m.index) - 1] ?? "";
      // The stub itself names the callable; it answers the start, so it is not one.
      if (STUB.test(lineText)) continue;
      const test = tests.filter((t) => t.at < m.index).at(-1);
      if (!test) {
        starts.push({ file, line: lineOf(m.index), ok: false, why: "outside any test" });
        continue;
      }
      if (test.options.includes("@quota")) {
        starts.push({ file, line: lineOf(m.index), ok: true, why: "@quota" });
        continue;
      }
      const block = source.slice(test.at, m.index);
      const stub = block.search(STUB);
      if (stub < 0) {
        starts.push({ file, line: lineOf(m.index), ok: false, why: "no @quota tag and no stub" });
        continue;
      }
      // A stub that lets a POST through to the server starts one after all: every continue() must sit behind a POST check.
      const handler = block.slice(stub).split("\n").filter((l) => l.includes("continue("));
      const leaks = handler.filter((l) => !l.includes('"POST"'));
      starts.push(leaks.length ? { file, line: lineOf(m.index), ok: false, why: "the stub lets the start through" } : { file, line: lineOf(m.index), ok: true, why: "stub" });
    }
  }
  return starts;
}

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, keep));
    else if (keep(name)) out.push(path);
  }
  return out;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checks never spend the judges' practice searches", () => {
  it("the guard catches an untagged start, a helper's start and a stub that lets the start through", () => {
    const click = 'await page.getByRole("button", { name: "Try a practice search" }).click();';
    expect(practiceStarts("a", `test("starts", async ({ page }) => {\n  ${click}\n});`)[0]).toMatchObject({ ok: false });
    expect(practiceStarts("a", `test("starts", { tag: "@quota" }, async ({ page }) => {\n  ${click}\n});`)[0]).toMatchObject({ ok: true });
    const stubbed = (handler: string) => `test("stubbed", async ({ page }) => {\n  await page.route("**/startJudgeSession", ${handler});\n  ${click}\n});`;
    expect(practiceStarts("a", stubbed("(route) => route.fulfill(seat)"))[0]).toMatchObject({ ok: true });
    expect(practiceStarts("a", stubbed('(route) => (route.request().method() === "POST" ? undefined : route.continue())'))[0]).toMatchObject({ ok: true });
    expect(practiceStarts("a", stubbed("(route) => route.continue()"))[0]).toMatchObject({ ok: false, why: "the stub lets the start through" });
    expect(practiceStarts("a", `test("held", async ({ page }) => {\n  const b = page.getByRole("button", { name: "Try a practice search" });\n  await b.click();\n});`)[0]).toMatchObject({ ok: false });
    expect(practiceStarts("a", 'export const start = (r) => r.post(`${base}/startJudgeSession`, {});')[0]).toMatchObject({ ok: false, why: "outside any test" });
  });

  it("every practice start in the browser checks, workflows and scripts is tagged @quota or stubbed", () => {
    const e2e = filesUnder(join(ROOT, "web/e2e"), (n) => n.endsWith(".ts"));
    const other = [
      ...filesUnder(join(ROOT, ".github/workflows"), (n) => n.endsWith(".yml") || n.endsWith(".yaml")),
      ...filesUnder(join(ROOT, "scripts"), (n) => n.endsWith(".py") || n.endsWith(".sh") || n.endsWith(".ts")),
    ];
    // A scan that reads nothing passes in the same words as one that reads everything.
    expect(e2e.length).toBeGreaterThan(80);
    expect(other.length).toBeGreaterThan(40);
    const starts = [...e2e, ...other].flatMap((f) => practiceStarts(f.slice(ROOT.length), readFileSync(f, "utf8")));
    expect(starts.filter((s) => s.why === "@quota").length).toBeGreaterThanOrEqual(2);
    expect(starts.filter((s) => s.why === "stub").length).toBeGreaterThanOrEqual(5);
    expect(starts.filter((s) => !s.ok)).toEqual([]);
  });

  it("the live run skips @quota checks unless PLS_ALLOW_QUOTA=1", async () => {
    const LIVE_CONFIG = "../e2e/playwright.config.ts";
    const load = async () => {
      vi.resetModules();
      return ((await import(LIVE_CONFIG)) as { default: { grepInvert?: RegExp } }).default;
    };
    vi.stubEnv("PLS_ALLOW_QUOTA", "");
    const skip = (await load()).grepInvert;
    expect(skip?.test("a practice search opens @quota")).toBe(true);
    expect(skip?.test("checks the map @placeholder-build")).toBe(true);
    expect(skip?.test("checks the map")).toBe(false);
    vi.stubEnv("PLS_ALLOW_QUOTA", "1");
    const allow = (await load()).grepInvert;
    expect(allow?.test("a practice search opens @quota")).toBe(false);
    expect(allow?.test("checks the map @placeholder-build")).toBe(true);
  });
});
