import { describe, expect, it } from "vitest";
import { bytesToBase64, photoPath, photoReadingDoc, sha256Hex } from "./photos";

const cues = { placeType: "store" as const, placeName: "", signText: "OPEN", landmarks: [], outdoors: "yes" as const, evidence: "a shop" };
const route = { platform: "web" as const, path: "on_device" as const, stage: "sdk" as const, model: "chrome-built-in", reason: "sdk_only_on_device" as const, latencyMs: 1200, sdkReported: true, blocked: null, decidedAtMs: 1 };

describe("sha256Hex", () => {
  it("hashes bytes to 64 lowercase hex characters", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("photoPath", () => {
  it("names a photo by its content hash under its incident", () => {
    expect(photoPath("drill-dev-1", "a".repeat(64))).toBe(`photos/drill-dev-1/${"a".repeat(64)}.jpg`);
  });

  it("refuses anything that is not a hash, so a name can never become a path", () => {
    expect(() => photoPath("drill-dev-1", "../other")).toThrow();
    expect(() => photoPath("drill-dev-1", "A".repeat(64))).toThrow();
  });
});

describe("photoReadingDoc", () => {
  it("holds the hash, path, cues, route and the family's answer, and expires after 30 days", () => {
    const now = Date.UTC(2026, 10, 22);
    const d = photoReadingDoc("drill-dev-1", "b".repeat(64), cues, route, "yes", now);
    expect(Object.keys(d).sort()).toEqual(["cues", "expiresAt", "familyDecision", "route", "sha256", "storagePath"]);
    expect(d.storagePath).toBe(`photos/drill-dev-1/${"b".repeat(64)}.jpg`);
    expect(d.expiresAt.getTime() - now).toBe(30 * 24 * 3600_000);
  });

  it("can store an unread photo's decision with no cues and no route", () => {
    expect(photoReadingDoc("I", "c".repeat(64), null, null, "not_sure", 0)).toMatchObject({ cues: null, route: null, familyDecision: "not_sure" });
  });
});

describe("bytesToBase64", () => {
  it("encodes large inputs without overflowing the call stack", () => {
    const big = new Uint8Array(300_000).fill(65);
    expect(bytesToBase64(big).slice(0, 8)).toBe("QUFBQUFB");
    expect(bytesToBase64(new TextEncoder().encode("hi"))).toBe("aGk=");
  });
});
