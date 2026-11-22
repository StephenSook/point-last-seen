import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The AI instance takes its App Check flag once per page, from the activated Remote Config value (the default when none
// is activated): the judge page and the command post share one instance and one flag, whichever asks first. A changed
// value applies on the next load, since getAI refuses a second instance with another flag (ALREADY_INITIALIZED).
async function load(remote: () => string) {
  const seen: unknown[] = [];
  vi.doMock("firebase/ai", async (orig) => ({
    ...(await orig<typeof import("firebase/ai")>()),
    getAI: (_app: unknown, opts: { useLimitedUseAppCheckTokens?: unknown }) => (seen.push(opts.useLimitedUseAppCheckTokens), { n: seen.length }),
  }));
  vi.doMock("firebase/remote-config", async (orig) => ({
    ...(await orig<typeof import("firebase/remote-config")>()),
    getRemoteConfig: () => ({}),
    getValue: () => ({ asString: remote, getSource: () => "remote" }),
  }));
  vi.resetModules();
  const { aiClient } = await import("./client");
  return { aiClient: aiClient as (app: unknown, ...rest: unknown[]) => unknown, seen };
}

describe("the AI instance's App Check flag", () => {
  it("is read once from the activated Remote Config value, so the judge page and the post share one instance and flag", async () => {
    const { aiClient, seen } = await load(() => "false");
    const app = {};
    const judge = aiClient(app);
    const post = aiClient(app);
    expect(post).toBe(judge);
    expect(seen).toEqual([false]);
    vi.doUnmock("firebase/ai");
    vi.doUnmock("firebase/remote-config");
  });

  it("takes the default (limited-use tokens on) when nothing is activated", async () => {
    const { aiClient, seen } = await load(() => "");
    aiClient({});
    expect(seen).toEqual([true]);
    vi.doUnmock("firebase/ai");
    vi.doUnmock("firebase/remote-config");
  });

  it("takes the default (limited-use tokens on) when Remote Config cannot be read", async () => {
    const { aiClient, seen } = await load(() => {
      throw new Error("no config");
    });
    aiClient({});
    expect(seen).toEqual([true]);
    vi.doUnmock("firebase/ai");
    vi.doUnmock("firebase/remote-config");
  });

  it("is never passed by a caller, so no caller can build the instance with a flag of its own", () => {
    for (const f of ["../judge/JudgePage.tsx", "../command/CommandPost.tsx"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).toMatch(/aiClient\(/);
      expect(src.match(/aiClient\([^()]*(\([^()]*\)[^()]*)*,/g), f).toBeNull();
    }
  });
});
