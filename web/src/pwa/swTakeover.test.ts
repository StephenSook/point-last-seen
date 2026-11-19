/// <reference types="node" />
// The worker's takeover rule (public/sw-takeover.js), run in a sandbox with fake pages: which pages it reloads.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../public/sw-takeover.js", import.meta.url), "utf8");

type FakePage = { id: string; url: string; focused: boolean; visibilityState: string; answers: boolean; navigated: number };

async function activate(pages: FakePage[], msSinceInstall: number): Promise<FakePage[]> {
  const listeners: Record<string, (e: { waitUntil(p: Promise<unknown>): void }) => void> = {};
  let now = 1_000_000;
  const clients = pages.map((p) => ({
    ...p,
    postMessage: (_msg: unknown, [port]: MessagePort[]) => { if (p.answers) port!.postMessage("pls-build-pong"); },
    navigate: async () => { p.navigated++; return null; },
  }));
  const self = {
    addEventListener: (type: string, fn: (e: { waitUntil(p: Promise<unknown>): void }) => void) => { listeners[type] = fn; },
    clients: { claim: async () => undefined, matchAll: async () => clients },
  };
  const DateFake = { now: () => now };
  runInNewContext(source, { self, MessageChannel, setTimeout, clearTimeout, Date: DateFake, Promise });
  listeners["install"]!({ waitUntil: () => undefined });
  now += msSinceInstall;
  let done: Promise<unknown> = Promise.resolve();
  listeners["activate"]!({ waitUntil: (p) => { done = p; } });
  await done;
  await new Promise((r) => setTimeout(r, 10));
  return pages;
}

const page = (over: Partial<FakePage>): FakePage => ({ id: Math.random().toString(36), url: "https://x/", focused: false, visibilityState: "visible", answers: false, navigated: 0, ...over });

describe("the new worker's takeover of open pages", () => {
  it("reloads the focused page of an older build that opened just now (a judge's first visit)", async () => {
    const [fresh] = await activate([page({ focused: true })], 5_000);
    expect(fresh!.navigated).toBe(1);
  });
  it("leaves an older-build page in a background tab alone, even hidden, so a half-written note is kept", async () => {
    const [background, hidden] = await activate([page({ focused: false }), page({ focused: false, visibilityState: "hidden" })], 5_000);
    expect(background!.navigated).toBe(0);
    expect(hidden!.navigated).toBe(0);
  });
  it("leaves pages of this build to themselves (they answer, then reload or ask)", async () => {
    const [current] = await activate([page({ focused: true, answers: true })], 5_000);
    expect(current!.navigated).toBe(0);
  });
  it("leaves even the focused older page alone when the update did not come from it opening just now", async () => {
    const [focused] = await activate([page({ focused: true })], 120_000);
    expect(focused!.navigated).toBe(0);
  });
});
