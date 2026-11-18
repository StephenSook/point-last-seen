import { describe, expect, it } from "vitest";
import { checkOnline } from "./online";

const ok = async () => new Response("{}", { status: 200 });

describe("checkOnline", () => {
  it("navigator.onLine false is offline, and no request is made", async () => {
    let calls = 0;
    expect(await checkOnline({ onLine: false, fetch: async () => { calls++; return ok(); } })).toBe(false);
    expect(calls).toBe(0);
  });

  it("onLine true with a failed fetch counts as offline", async () => {
    expect(await checkOnline({ onLine: true, fetch: async () => { throw new TypeError("Failed to fetch"); } })).toBe(false);
  });

  it("onLine true with an error status counts as offline", async () => {
    expect(await checkOnline({ onLine: true, fetch: async () => new Response("", { status: 503 }) })).toBe(false);
  });

  it("onLine true with a slow answer counts as offline", async () => {
    expect(await checkOnline({ onLine: true, fetch: () => new Promise(() => {}), timeoutMs: 20 })).toBe(false);
  });

  it("onLine true with a good answer is online", async () => {
    expect(await checkOnline({ onLine: true, fetch: ok })).toBe(true);
  });

  it("asks for version.json past every cache", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    await checkOnline({ onLine: true, fetch: async (url, init) => { seen.push({ url: String(url), init }); return ok(); } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toMatch(/^\/version\.json\?t=\d+$/);
    expect(seen[0]!.init?.cache).toBe("no-store");
  });
});
