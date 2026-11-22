import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The web always asks AI Logic for limited-use App Check tokens: replay protection is enforced on the project, so any
// other setting could only make cloud calls fail. The page's one instance is built once with that flag, whoever asks
// first (the judge page or the command post), and no Remote Config value or caller can change it.
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
  it("is limited-use tokens, once per page: the judge page and the post share one instance", async () => {
    const { aiClient, seen } = await load(() => "true");
    const app = {};
    const judge = aiClient(app);
    const post = aiClient(app);
    expect(post).toBe(judge);
    expect(seen).toEqual([true]);
    vi.doUnmock("firebase/ai");
    vi.doUnmock("firebase/remote-config");
  });

  it("stays on whatever Remote Config says, so a stale or early value can never switch it off for a page", async () => {
    const { aiClient, seen } = await load(() => "false");
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

describe("no web path steers the App Check flag", () => {
  it("reads no use_limited_use_tokens key and passes no false flag anywhere in web code", () => {
    const files = Object.entries(import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>)
      .filter(([path]) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));
    expect(files.length).toBeGreaterThan(10);
    const readers = files.filter(([, src]) => /use_limited_use_tokens|useLimitedUseTokens/.test(src)).map(([p]) => p);
    expect(readers).toEqual([]);
    const off = files.filter(([, src]) => /useLimitedUseAppCheckTokens\s*:\s*(?!\s)(?!true\b)/.test(src)).map(([p]) => p);
    expect(off).toEqual([]);
    const client = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
    expect(client).toMatch(/getAI\(app, \{ backend: new GoogleAIBackend\(\), useLimitedUseAppCheckTokens: true \}\)/);
  });
});
