import { describe, expect, it } from "vitest";
import { sha256Hex } from "../data/photos";
import { readStoredPhotoInCloud } from "./cloudRead";

const reply = { text: JSON.stringify({ placeType: "store", placeName: "", signText: "OPEN", landmarks: [], outdoors: "yes", evidence: "a shop" }), inferenceSource: "in_cloud" as const };
const consent = { byUid: "fam-1", atMs: 1 };

async function setup(over: { consent?: typeof consent | null | "throws"; stored?: boolean; nameSha?: string } = {}) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const sha = await sha256Hex(bytes);
  const calls: string[] = [];
  const deps = {
    confirmConsent: async (s: string) => {
      calls.push(`consent ${s === sha ? "own" : "other"}`);
      if (over.consent === "throws") throw new Error("offline");
      return over.consent === undefined ? consent : over.consent;
    },
    stillStored: async () => { calls.push("stored"); return over.stored ?? true; },
    generateCloud: async () => { calls.push("model"); return reply; },
    killCloud: false,
  };
  return { photo: { sha256: over.nameSha ?? sha, bytes }, deps, calls };
}

describe("readStoredPhotoInCloud", () => {
  it("with the family's consent for these exact bytes, the model is called once", async () => {
    const t = await setup();
    const r = await readStoredPhotoInCloud(t.photo, t.deps);
    expect("cues" in r).toBe(true);
    expect(t.calls).toEqual(["consent own", "stored", "model"]);
  });
  it("bytes that do not match the photo's name are never sent, whatever its consent says", async () => {
    const t = await setup({ nameSha: "f".repeat(64) });
    expect(await readStoredPhotoInCloud(t.photo, t.deps)).toEqual({ refused: "mismatch" });
    expect(t.calls).toEqual([]);
  });
  it("no consent record: no model call", async () => {
    const t = await setup({ consent: null });
    expect(await readStoredPhotoInCloud(t.photo, t.deps)).toEqual({ refused: "no-consent" });
    expect(t.calls).not.toContain("model");
  });
  it("a consent that cannot be read: no model call", async () => {
    const t = await setup({ consent: "throws" });
    expect(await readStoredPhotoInCloud(t.photo, t.deps)).toEqual({ refused: "consent-unchecked" });
    expect(t.calls).not.toContain("model");
  });
  it("a photo no longer stored: no model call", async () => {
    const t = await setup({ stored: false });
    expect(await readStoredPhotoInCloud(t.photo, t.deps)).toEqual({ refused: "deleted" });
    expect(t.calls).not.toContain("model");
  });
});
