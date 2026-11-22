import { afterEach, describe, expect, it, vi } from "vitest";

// Two worktrees running the browser harnesses at once each need their own port, so both configs read one from the
// environment and keep their old port when none is set.
type Cfg = { use?: { baseURL?: string }; webServer?: { command: string; url?: string } };
async function load(path: string): Promise<Cfg> {
  vi.resetModules();
  return ((await import(path)) as { default: Cfg }).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the harness and extras configs take their port from the environment", () => {
  it("default to 5175 and 5176", async () => {
    vi.stubEnv("PLS_HARNESS_PORT", "");
    vi.stubEnv("PLS_EXTRAS_PORT", "");
    const h = await load("../e2e/harness.config.ts");
    expect(h.use?.baseURL).toBe("http://127.0.0.1:5175");
    expect(h.webServer?.command).toContain("--port 5175 --strictPort");
    expect(h.webServer?.url).toBe("http://127.0.0.1:5175/harness/map.html");
    const x = await load("../e2e/extras.config.ts");
    expect(x.use?.baseURL).toBe("http://127.0.0.1:5176");
    expect(x.webServer?.command).toContain("--port 5176 --strictPort");
  });

  it("use PLS_HARNESS_PORT and PLS_EXTRAS_PORT when set", async () => {
    vi.stubEnv("PLS_HARNESS_PORT", "5185");
    vi.stubEnv("PLS_EXTRAS_PORT", "5186");
    const h = await load("../e2e/harness.config.ts");
    expect(h.use?.baseURL).toBe("http://127.0.0.1:5185");
    expect(h.webServer?.command).toContain("--port 5185 --strictPort");
    expect(h.webServer?.url).toBe("http://127.0.0.1:5185/harness/map.html");
    const x = await load("../e2e/extras.config.ts");
    expect(x.use?.baseURL).toBe("http://127.0.0.1:5186");
    expect(x.webServer?.command).toContain("--port 5186 --strictPort");
  });

  it("refuse a port that is not a whole number from 1024 to 65535", async () => {
    vi.stubEnv("PLS_HARNESS_PORT", "80");
    await expect(load("../e2e/harness.config.ts")).rejects.toThrow(/PLS_HARNESS_PORT/);
    vi.stubEnv("PLS_HARNESS_PORT", "51x5");
    await expect(load("../e2e/harness.config.ts")).rejects.toThrow(/PLS_HARNESS_PORT/);
  });
});

describe("the live suite runs every check on the shared test drill one at a time", () => {
  type Project = { name: string; workers?: number; testMatch?: unknown; testIgnore?: unknown; dependencies?: string[] };
  const matches = (pattern: unknown, file: string) =>
    (Array.isArray(pattern) ? pattern : [pattern]).some((p) => (p instanceof RegExp ? p.test(file) : typeof p === "string" && p.endsWith("/**") && file.includes(`/e2e/${p.slice(0, -3)}/`)));
  it("puts each spec that joins or names the drill in one serial project, and the rest in the parallel one", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../e2e/", import.meta.url);
    const specs = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));
    const onDrill = specs.filter((f) => /joinCommand\(|PLS_SMOKE_INCIDENT/.test(readFileSync(new URL(f, dir), "utf8")));
    expect(onDrill.length).toBeGreaterThan(10);
    const cfg = (await load("../e2e/playwright.config.ts")) as Cfg & { projects: Project[] };
    const serial = cfg.projects.find((p) => p.name === "chrome-drill")!;
    const parallel = cfg.projects.find((p) => p.name === "chrome")!;
    expect(serial.workers).toBe(1);
    expect(serial.dependencies).toEqual(["setup"]);
    for (const f of specs) {
      const path = new URL(f, dir).pathname;
      const inSerial = matches(serial.testMatch, path);
      const inParallel = !matches(parallel.testIgnore, path);
      expect([f, inSerial, inParallel]).toEqual([f, onDrill.includes(f), !onDrill.includes(f)]);
    }
    // Harness and extras specs (run by their own configs) are in neither project.
    for (const sub of ["harness", "extras"]) {
      for (const f of readdirSync(new URL(`${sub}/`, dir)).filter((n) => n.endsWith(".spec.ts"))) {
        const path = new URL(`${sub}/${f}`, dir).pathname;
        expect([`${sub}/${f}`, matches(serial.testMatch, path), matches(parallel.testIgnore, path)]).toEqual([`${sub}/${f}`, false, true]);
      }
    }
  });
});
