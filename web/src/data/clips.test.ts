import { describe, expect, it } from "vitest";
import { serverTimestamp, Timestamp } from "firebase/firestore";
import { clipPath, clipReadingFromDoc, completion, consentRecord, renewConsent, READING_TTL_MS, type ClipRecordInput } from "./clips";

const SHA = "a".repeat(64);
const NOW = 1_763_500_000_000;
const mark = { byUid: "u1", atMs: NOW - 1000 };
const input: ClipRecordInput = {
  incidentId: "drill-dev-1",
  sha256: SHA,
  durationS: 21,
  clipStartMs: NOW - 3_600_000,
  clockConfirmed: true,
  cameraFacingDeg: 90,
  consent: { personInClip: mark, footageOwner: mark, cloudProcessing: mark, publicUse: null },
  uid: "u1",
  nowMs: NOW,
};

// The rules' key list for a new clip reading (firestore.rules, validNewClipReading).
const RULE_KEYS = ["sha256", "storagePath", "durationS", "clipStartMs", "clockConfirmed", "cameraFacingDeg", "reading", "route", "consent", "expiresAt", "createdAt", "createdByUid"];

describe("clipPath", () => {
  it("names a clip by its SHA-256 under the incident", () => {
    expect(clipPath("drill-dev-1", SHA)).toBe(`clips/drill-dev-1/${SHA}.mp4`);
  });
  it("refuses a name that is not a SHA-256", () => {
    expect(() => clipPath("drill-dev-1", "abc")).toThrow(/SHA-256/);
  });
});

describe("consentRecord", () => {
  it("has exactly the rules' keys, no reading or route yet, and the four consents", () => {
    const d = consentRecord(input);
    expect(Object.keys(d).sort()).toEqual([...RULE_KEYS].sort());
    expect(d.sha256).toBe(SHA);
    expect(d.storagePath).toBe(`clips/drill-dev-1/${SHA}.mp4`);
    expect(d.reading).toBeNull();
    expect(d.route).toBeNull();
    expect(d.consent).toEqual({ personInClip: mark, footageOwner: mark, cloudProcessing: mark, publicUse: null });
    expect(d.createdByUid).toBe("u1");
    expect([d.durationS, d.clipStartMs, d.clockConfirmed, d.cameraFacingDeg]).toEqual([21, NOW - 3_600_000, true, 90]);
  });

  it("expires 32 days out (the rules accept 31 to 33) with the server's createdAt", () => {
    const d = consentRecord(input);
    expect(READING_TTL_MS).toBe(32 * 24 * 3600 * 1000);
    expect(d.expiresAt).toEqual(Timestamp.fromMillis(NOW + READING_TTL_MS));
    expect(d.createdAt.isEqual(serverTimestamp())).toBe(true);
  });
});

describe("renewConsent", () => {
  it("keeps every stored field and renews only the consent, the expiry and createdAt", () => {
    const stored = clipReadingFromDoc({ ...consentRecord(input), clipStartMs: 5, cameraFacingDeg: 180, durationS: 9, createdAt: Timestamp.fromMillis(1), expiresAt: Timestamp.fromMillis(2) })!;
    const fresh = { personInClip: { byUid: "u1", atMs: NOW }, footageOwner: { byUid: "u1", atMs: NOW }, cloudProcessing: { byUid: "u1", atMs: NOW }, publicUse: null };
    const d = renewConsent(stored, fresh, NOW);
    expect(Object.keys(d).sort()).toEqual([...RULE_KEYS].sort());
    expect([d.clipStartMs, d.cameraFacingDeg, d.durationS, d.createdByUid, d.storagePath]).toEqual([5, 180, 9, "u1", `clips/drill-dev-1/${SHA}.mp4`]);
    expect(d.consent).toEqual(fresh);
    expect(d.expiresAt).toEqual(Timestamp.fromMillis(NOW + READING_TTL_MS));
    expect(d.createdAt.isEqual(serverTimestamp())).toBe(true);
    expect(d.reading).toBeNull();
  });
});

describe("completion", () => {
  it("sets only the reading and the route", () => {
    const route = { platform: "web", path: "cloud", stage: "sdk", model: "m", reason: "sdk_only_in_cloud", latencyMs: 9, sdkReported: true, blocked: null, decidedAtMs: NOW };
    expect(Object.keys(completion({ personVisible: true }, route as never))).toEqual(["reading", "route"]);
  });
});

describe("clipReadingFromDoc", () => {
  it("reads a stored record back, with times in milliseconds", () => {
    const r = clipReadingFromDoc({ ...consentRecord(input), createdAt: Timestamp.fromMillis(NOW) });
    expect(r).toMatchObject({ sha256: SHA, durationS: 21, cameraFacingDeg: 90, reading: null, route: null, createdAtMs: NOW, expiresAtMs: NOW + READING_TTL_MS, createdByUid: "u1" });
  });
  it("returns null for a record it cannot read", () => {
    expect(clipReadingFromDoc({ sha256: SHA })).toBeNull();
    expect(clipReadingFromDoc(undefined)).toBeNull();
  });
});
