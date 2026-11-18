import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import shared from "../../../shared/schemas/camera-sighting.schema.json";
import { CAMERA_SIGHTING_JSON, CLIP_PROMPT, CONSENT_GONE, clipCloudParams, clipParts, clipReadDeps, parseCameraSighting, readClip, type ClipReadDeps, type ClipReadRequest } from "./clipRead";
import { sha256Hex } from "../data/photos";
import type { StoredClipReading } from "../data/clips";

describe("clip read parameters", () => {
  it("reads only in the cloud, with the clip schema", () => {
    const p = clipCloudParams("gemini-3.5-flash-lite");
    expect(p.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(p.inCloudParams?.model).toBe("gemini-3.5-flash-lite");
    expect(p.inCloudParams?.generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: CAMERA_SIGHTING_JSON });
  });

  it("asks for every field of the shared CameraSighting schema, with the same closed lists and caps", () => {
    expect(CAMERA_SIGHTING_JSON.required).toEqual(shared.required);
    expect(Object.keys(CAMERA_SIGHTING_JSON.properties).sort()).toEqual(Object.keys(shared.properties).sort());
    const P = CAMERA_SIGHTING_JSON.properties;
    const S = shared.properties;
    for (const k of ["entryEdge", "exitEdge", "topColor", "bottomColor", "lighting", "legibility"] as const) expect(P[k].enum).toEqual(S[k].enum);
    for (const k of ["topType", "footwear", "headwear", "evidence"] as const) expect(P[k].maxLength).toBe(S[k].maxLength);
    expect(P.carriedItems.maxItems).toBe(S.carriedItems.maxItems);
    expect(P.keyFrame.required).toEqual(S.keyFrame.required);
    expect(P.keyFrame.properties.box2d).toMatchObject({ minItems: 4, maxItems: 4 });
  });

  it("tells the model not to describe the face or guess who the person is", () => {
    expect(CLIP_PROMPT).toContain("Do not describe the face.");
    expect(CLIP_PROMPT).toContain("Do not guess who the person is.");
  });

  it("with a window, the model reads only those seconds (videoMetadata offsets, times still from the clip start)", () => {
    expect(clipParts("AAAA", "video/mp4", { startS: 4, endS: 11.5 })[0]).toEqual({
      type: "inlineData", inlineData: { mimeType: "video/mp4", data: "AAAA" }, videoMetadata: { startOffset: "4s", endOffset: "11.5s" },
    });
  });

  it("sends the clip inline with its own type, then the prompt", () => {
    expect(clipParts("AAAA", "video/quicktime")).toEqual([
      { type: "inlineData", inlineData: { mimeType: "video/quicktime", data: "AAAA" } },
      { type: "text", text: CLIP_PROMPT },
    ]);
  });
});

// readClip: the order and the refusals the Android family app follows (ClipReader.kt).

const goodReply = {
  personVisible: true, firstSeen: "00:03", lastSeen: "00:12", entryEdge: "right", exitEdge: "left",
  topColor: "blue", bottomColor: "black", topType: "rain jacket", footwear: "boots", headwear: "none",
  carriedItems: ["umbrella"], keyFrame: { time: "00:07", box2d: [100, 200, 900, 400] },
  lighting: "day", legibility: "clear", evidence: "An adult in a blue jacket walks from right to left.",
};
const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const NOW = 1_763_500_000_000;
const mark = { byUid: "u1", atMs: NOW - 10 };

async function setup(over: { stored?: Partial<StoredClipReading> | null; exists?: boolean; reply?: unknown; modelThrows?: boolean; killCloud?: boolean } = {}) {
  const sha = await sha256Hex(bytes);
  const calls: string[] = [];
  const written: Record<string, unknown>[] = [];
  const completed: { reading: unknown; route: unknown }[] = [];
  const generated: unknown[] = [];
  const stored: StoredClipReading | null = over.stored === undefined || over.stored === null ? null : {
    sha256: sha, storagePath: `clips/drill-dev-1/${sha}.mp4`, durationS: 20, clipStartMs: 5, clockConfirmed: true, cameraFacingDeg: 180,
    reading: null, route: null, consent: { personInClip: mark, footageOwner: mark, cloudProcessing: mark, publicUse: null },
    expiresAtMs: 1, createdAtMs: 1, createdByUid: "u1", ...over.stored,
  };
  // The record as the server holds it: the consent write renews it (a 31-day expiry); dropRecord() is a
  // command deleting it.
  let current: StoredClipReading | null = stored;
  const deps: ClipReadDeps = {
    findReading: async () => { calls.push("find"); return current; },
    writeConsent: async (d) => {
      calls.push("consent");
      written.push(d as unknown as Record<string, unknown>);
      current = { ...(current ?? (stored as StoredClipReading) ?? ({} as StoredClipReading)), sha256: sha, reading: null, route: null, expiresAtMs: NOW + 31 * 86_400_000 };
    },
    clipExists: async () => { calls.push("exists"); return over.exists ?? false; },
    upload: async () => { calls.push("upload"); },
    generate: async (_b, _m, w) => { calls.push("model"); generated.push(w); if (over.modelThrows) throw new Error("x"); return { text: typeof over.reply === "string" ? over.reply : JSON.stringify(over.reply ?? goodReply), inferenceSource: "in_cloud" }; },
    complete: async (_s, reading, route) => { calls.push("complete"); completed.push({ reading, route }); },
    nowMs: () => NOW,
  };
  const req: ClipReadRequest = {
    incidentId: "drill-dev-1", bytes, mimeType: "video/mp4", durationS: 20, clipStartMs: NOW - 60_000, clockConfirmed: true, cameraFacingDeg: 90,
    consent: { clipSha256: sha, personInClip: mark, footageOwner: mark, cloudProcessing: mark, publicUse: null },
    killCloud: () => over.killCloud ?? false, model: "gemini-3.5-flash-lite", uid: "u1",
  };
  return { sha, calls, written, completed, generated, deps, req, dropRecord: () => { current = null; } };
}

describe("readClip", () => {
  it("refuses a clip over 14,000,000 bytes before anything else", async () => {
    const t = await setup();
    const r = await readClip({ ...t.req, bytes: new Uint8Array(14_000_001) }, t.deps);
    expect(r).toEqual({ kind: "refused", message: "This clip is larger than 14,000,000 bytes. Trim it and try again." });
    expect(t.calls).toEqual([]);
  });

  it("refuses a clip whose length could not be read", async () => {
    const t = await setup();
    expect((await readClip({ ...t.req, durationS: 0 }, t.deps)).kind).toBe("refused");
    expect(t.calls).toEqual([]);
  });

  it("refuses without the three required consents, or with consents given for other bytes", async () => {
    const t = await setup();
    const r = await readClip({ ...t.req, consent: { ...t.req.consent, cloudProcessing: null } }, t.deps);
    expect(r).toEqual({ kind: "refused", message: expect.stringMatching(/consent/) });
    expect((await readClip({ ...t.req, consent: { ...t.req.consent, clipSha256: "b".repeat(64) } }, t.deps)).kind).toBe("refused");
    expect(t.calls).toEqual([]);
  });

  it("sends nothing while command has paused the cloud", async () => {
    const t = await setup({ killCloud: true });
    expect(await readClip(t.req, t.deps)).toEqual({ kind: "refused", message: "Clip reading is paused right now." });
    expect(t.calls).toEqual([]);
  });

  it("a cloud pause that arrives during the consent write stops the read before the upload", async () => {
    const t = await setup();
    let paused = false;
    const r = await readClip({ ...t.req, killCloud: () => paused }, { ...t.deps, writeConsent: async () => { t.calls.push("consent"); paused = true; } });
    expect(r).toEqual({ kind: "refused", message: "Clip reading is paused right now." });
    expect(t.calls).toEqual(["find", "consent"]);
  });

  it("a cloud pause that arrives while a retry checks for the stored clip stops the upload", async () => {
    const t = await setup({ stored: {}, exists: false });
    let paused = false;
    const r = await readClip({ ...t.req, killCloud: () => paused }, { ...t.deps, clipExists: async () => { t.calls.push("exists"); paused = true; return false; } });
    expect(r).toEqual({ kind: "refused", message: "Clip reading is paused right now." });
    expect(t.calls).toEqual(["find", "consent", "exists"]);
  });

  it("on a miss: consent record, then upload, then the model, then the completion", async () => {
    const t = await setup();
    const r = await readClip(t.req, t.deps);
    expect(t.calls).toEqual(["find", "consent", "upload", "find", "model", "complete"]);
    expect(r.kind).toBe("read");
    if (r.kind !== "read") return;
    expect(r.cached).toBe(false);
    expect(r.bearingDeg).toBe(0); // facing 90, leaving by the left edge
    expect(r.route).toMatchObject({ platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "sdk_only_in_cloud", sdkReported: true });
    expect(t.written[0]).toMatchObject({ sha256: t.sha, durationS: 20, cameraFacingDeg: 90, createdByUid: "u1", consent: { personInClip: mark, footageOwner: mark, cloudProcessing: mark, publicUse: null } });
  });

  it("returns a stored reading with no model call and no write, taking the bearing from the facing just given", async () => {
    const t = await setup({ stored: { reading: goodReply } });
    const r = await readClip(t.req, t.deps);
    expect(t.calls).toEqual(["find"]);
    expect(r).toMatchObject({ kind: "read", cached: true, bearingDeg: 0 });
  });

  it("takes over a stalled record (no reading) left by another user, and skips the upload when the clip is stored", async () => {
    const t = await setup({ stored: { createdByUid: "someone-else" }, exists: true });
    await readClip(t.req, t.deps);
    expect(t.calls).toEqual(["find", "consent", "exists", "find", "model", "complete"]);
    // The writer becomes the owner with fresh consent; the stored start time, facing and length stay.
    expect(t.written[0]).toMatchObject({ createdByUid: "u1", clipStartMs: 5, cameraFacingDeg: 180, durationS: 20, consent: { personInClip: mark } });
  });

  it("a reading that fails its checks is stored as a typed no-sighting result with its reasons", async () => {
    const t = await setup({ reply: { ...goodReply, firstSeen: "00:15", lastSeen: "00:10" } });
    expect(await readClip(t.req, t.deps)).toEqual({ kind: "could-not-read" });
    expect(t.calls).toEqual(["find", "consent", "upload", "find", "model", "complete"]);
    expect(t.completed[0]!.reading).toEqual({ status: "no_sighting", reasons: ["first_after_last"] });
    expect(t.completed[0]!.route).toMatchObject({ reason: "sdk_only_in_cloud" });
  });

  it("a windowed read that finds no one stores nothing, so a later full-clip read is not blocked", async () => {
    const t = await setup({ reply: { ...goodReply, personVisible: false } });
    expect(await readClip({ ...t.req, window: { startS: 2, endS: 9 }, reason: "on_device_triage_flagged" }, t.deps)).toEqual({ kind: "could-not-read" });
    expect(t.calls).toEqual(["find", "consent", "upload", "find", "model"]);
  });

  it("a reply it cannot read is stored as no sighting, reason unreadable_reply", async () => {
    const t = await setup({ reply: "not json" });
    expect(await readClip(t.req, t.deps)).toEqual({ kind: "could-not-read" });
    expect(t.completed[0]!.reading).toEqual({ status: "no_sighting", reasons: ["unreadable_reply"] });
  });

  it("a stored no-sighting result is returned with no model call and no write", async () => {
    const t = await setup({ stored: { reading: { status: "no_sighting", reasons: ["no_person"] } } });
    expect(await readClip(t.req, t.deps)).toEqual({ kind: "could-not-read" });
    expect(t.calls).toEqual(["find"]);
  });

  it("a windowed miss stored by older code does not block a full read: it reads again and writes nothing", async () => {
    const windowedMiss = { reading: { status: "no_sighting", reasons: ["no_person"] }, route: { reason: "on_device_triage_flagged" } as StoredClipReading["route"], expiresAtMs: NOW + 60_000 };
    // The model gets the bytes inline, so nothing in Storage is checked or uploaded either (the upload
    // rule needs the caller to own the record with 31 days left, which a second seat does not).
    const t = await setup({ stored: windowedMiss, exists: false });
    const r = await readClip(t.req, t.deps);
    expect(t.calls).toEqual(["find", "find", "model"]);
    expect(t.generated).toEqual([undefined]);
    expect(r).toMatchObject({ kind: "read", cached: false, route: { reason: "sdk_only_in_cloud" } });
    expect(t.written).toEqual([]);
    expect(t.completed).toEqual([]);
  });

  it("an old windowed miss whose consent has expired is not read again", async () => {
    const t = await setup({ stored: { reading: { status: "no_sighting", reasons: ["no_person"] }, route: { reason: "on_device_triage_flagged" } as StoredClipReading["route"], expiresAtMs: NOW - 1 }, exists: true });
    expect(await readClip(t.req, t.deps)).toEqual({ kind: "could-not-read" });
    expect(t.calls).toEqual(["find"]);
  });

  it("a full-clip no-sighting stays final", async () => {
    const t = await setup({ stored: { reading: { status: "no_sighting", reasons: ["no_person"] }, route: { reason: "sdk_only_in_cloud" } as StoredClipReading["route"], expiresAtMs: NOW + 60_000 } });
    expect(await readClip(t.req, t.deps)).toEqual({ kind: "could-not-read" });
    expect(t.calls).toEqual(["find"]);
  });

  it("a consent record deleted after it was written stops the clip before it reaches the model", async () => {
    const t = await setup();
    const r = await readClip(t.req, { ...t.deps, upload: async () => { t.calls.push("upload"); t.dropRecord(); } });
    expect(r).toEqual({ kind: "refused", message: CONSENT_GONE });
    expect(t.calls).toEqual(["find", "consent", "upload", "find"]);
    expect(t.generated).toEqual([]);
  });

  it("an old windowed miss whose record is deleted after the lookup is not sent", async () => {
    const t = await setup({ stored: { reading: { status: "no_sighting", reasons: ["no_person"] }, route: { reason: "on_device_triage_flagged" } as StoredClipReading["route"], expiresAtMs: NOW + 60_000 } });
    let lookups = 0;
    const r = await readClip(t.req, { ...t.deps, findReading: async () => { t.calls.push("find"); lookups += 1; if (lookups > 1) return null; return (await t.deps.findReading(t.sha)); } });
    expect(r).toEqual({ kind: "refused", message: CONSENT_GONE });
    expect(t.generated).toEqual([]);
  });

  it("passes the flagged window to the model and records the route's reason", async () => {
    const t = await setup();
    const r = await readClip({ ...t.req, window: { startS: 2, endS: 9 }, reason: "on_device_triage_flagged" }, t.deps);
    expect(t.generated).toEqual([{ startS: 2, endS: 9 }]);
    expect(r).toMatchObject({ kind: "read", route: { reason: "on_device_triage_flagged" } });
  });

  it("a model failure keeps only the consent record", async () => {
    const t = await setup({ modelThrows: true });
    expect(await readClip(t.req, t.deps)).toEqual({ kind: "failed" });
    expect(t.calls).toEqual(["find", "consent", "upload", "find", "model"]);
  });
});

describe("parseCameraSighting", () => {
  it("accepts the schema's shape", () => {
    expect(parseCameraSighting(JSON.stringify(goodReply))).toEqual(goodReply);
  });
  it("refuses an edge, lighting or legibility off the closed lists, and malformed JSON", () => {
    expect(parseCameraSighting(JSON.stringify({ ...goodReply, exitEdge: "sideways" }))).toBeNull();
    expect(parseCameraSighting(JSON.stringify({ ...goodReply, lighting: "dusk" }))).toBeNull();
    expect(parseCameraSighting(JSON.stringify({ ...goodReply, legibility: "ok" }))).toBeNull();
    expect(parseCameraSighting(JSON.stringify({ ...goodReply, keyFrame: { time: "00:07" } }))).toBeNull();
    expect(parseCameraSighting("{")).toBeNull();
  });
});

describe("clipReadDeps", () => {
  it("hands the cloud model the flagged window: the generator is passed through, not wrapped", async () => {
    const t = await setup();
    const seen: unknown[] = [];
    const generate = async (_b: string, _m: string, w?: { startS: number; endS: number }) => {
      seen.push(w);
      return { text: JSON.stringify(goodReply), inferenceSource: "in_cloud" };
    };
    const { generate: _g, nowMs: _n, ...io } = t.deps;
    await readClip({ ...t.req, window: { startS: 4, endS: 8 }, reason: "on_device_triage_flagged" }, clipReadDeps(io, generate, () => 0));
    expect(seen).toEqual([{ startS: 4, endS: 8 }]);
  });
});
