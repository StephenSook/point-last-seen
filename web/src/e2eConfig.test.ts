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
