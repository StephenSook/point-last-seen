import { InferenceMode } from "firebase/ai";
import { describe, expect, it } from "vitest";
import type { StoredClipReading } from "../data/clips";
import {
  CLIP_TRACK_VERSION,
  clipTrackParams,
  MASK_JSON,
  TRACK_JSON,
  parseMaskReply,
  parseTrackReply,
  readClipTrack,
  TRACK_BOX_FRAMES_PER_CALL,
  TRACK_MASK_FRAMES_PER_CALL,
  trackFrameTimes,
  trackParts,
  type TrackReadDeps,
  type TrackReadRequest,
} from "./clipTrack";

const SHA = "a".repeat(64);

describe("trackFrameTimes", () => {
  it("takes one frame per whole second of the window and the clip's last frame when it is past the half second", () => {
    // 9.0 s at 30 fps: 0..8, then the last frame (8.967 s) labelled with its rounded second.
    const nine = trackFrameTimes({ startS: 0, endS: 9 }, 9, 1 / 30);
    expect(nine.map((f) => f.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(nine.at(-1)!.atS).toBeCloseTo(9 - 1 / 30, 6);
    // 14.3 s: the last frame (14.27 s) is within half a second of 14, so nothing is added.
    expect(trackFrameTimes({ startS: 0, endS: 14.3 }, 14.3, 1 / 30).map((f) => f.t)).toEqual([...Array(15).keys()]);
    // 11.56 s at 25 fps: the last frame (11.52 s) would be labelled 12, past the window's end, so it is left out.
    expect(trackFrameTimes({ startS: 0, endS: 11.56 }, 11.56, 1 / 25).map((f) => f.t).slice(-2)).toEqual([10, 11]);
    // A window that holds no whole second and whose last frame rounds past it gives no frames.
    expect(trackFrameTimes({ startS: 9.5, endS: 9.6 }, 9.6, 1 / 30)).toEqual([]);
  });

  it("starts at the window's first whole second and never passes the clip", () => {
    const f = trackFrameTimes({ startS: 2.4, endS: 30 }, 6, 1 / 30);
    expect(f.map((x) => x.t)).toEqual([3, 4, 5, 6]);
    expect(Math.max(...f.map((x) => x.atS))).toBeLessThan(6);
  });
});

describe("trackParts", () => {
  it("puts the instruction first, then t= before each frame", () => {
    const parts = trackParts([{ t: 0, jpeg: "AAA" }, { t: 1, jpeg: "BBB" }], false);
    const show = (p: unknown) => {
      const x = p as { text?: string; inlineData?: { data: string } };
      return x.text !== undefined ? `text:${x.text.startsWith("These are frames") ? "instruction" : x.text}` : `image:${x.inlineData?.data}`;
    };
    expect(parts.map(show)).toEqual([
      "text:instruction",
      "text:t=0",
      "image:AAA",
      "text:t=1",
      "image:BBB",
    ]);
    expect(parts[2]).toMatchObject({ inlineData: { mimeType: "image/jpeg" } });
  });

  it("asks for an outline only on a mask read", () => {
    const say = (withMask: boolean) => (trackParts([{ t: 0, jpeg: "A" }], withMask)[0] as { text: string }).text;
    expect(say(true)).toMatch(/mask/);
    expect(say(false)).not.toMatch(/mask/);
  });
});

describe("parseTrackReply", () => {
  const sent = [0, 1, 2, 3];
  const reply = (track: unknown[]) => JSON.stringify({ track });

  it("keeps a box for each second with a person and skips a null box", () => {
    const e = parseTrackReply(reply([{ t: 0, label: "person", box_2d: null }, { t: 1, label: "person", box_2d: [100, 200, 900, 400] }]), [0, 1]);
    expect(e).toEqual([{ t: 1, box: [100, 200, 900, 400], source: "cloud" }]);
  });

  it("drops a box that is not labelled a person, and keeps the rest", () => {
    const e = parseTrackReply(reply([{ t: 1, label: "car", box_2d: [100, 200, 900, 400] }, { t: 2, label: "Person", box_2d: [100, 210, 900, 410] }]), [1, 2]);
    expect(e?.map((x) => x.t)).toEqual([2]);
  });

  it.each([
    ["a time that was not sent", [{ t: 7, label: "person", box_2d: [1, 1, 2, 2] }]],
    ["times out of order", [{ t: 2, label: "person", box_2d: [1, 1, 2, 2] }, { t: 1, label: "person", box_2d: [1, 1, 2, 2] }]],
    ["a repeated time", [{ t: 1, label: "person", box_2d: [1, 1, 2, 2] }, { t: 1, label: "person", box_2d: [1, 1, 2, 2] }]],
    ["a number past 1000", [{ t: 1, label: "person", box_2d: [100, 200, 1001, 400] }]],
    ["a box with its corners swapped", [{ t: 1, label: "person", box_2d: [900, 200, 100, 400] }]],
    ["a box with three numbers", [{ t: 1, label: "person", box_2d: [100, 200, 900] }]],
    ["a fractional time", [{ t: 1.5, label: "person", box_2d: [1, 1, 2, 2] }]],
  ])("refuses the whole track for %s", (_why, track) => {
    expect(parseTrackReply(reply(track as unknown[]), sent)).toBeNull();
  });

  it("refuses a reply with fewer entries than frames, an empty one included", () => {
    expect(parseTrackReply(reply([]), [0, 1])).toBeNull();
    expect(parseTrackReply(reply([{ t: 0, label: "person", box_2d: null }]), [0, 1])).toBeNull();
  });

  it("refuses more entries than frames, and a reply that is not JSON", () => {
    expect(parseTrackReply(reply([0, 1, 2, 3, 4].map((t) => ({ t, label: "person", box_2d: null }))), [0, 1, 2, 3, 4].slice(0, 4))).toBeNull();
    expect(parseTrackReply("{ track: [", sent)).toBeNull();
  });
});

describe("parseMaskReply", () => {
  it("keeps an outline of at least 3 points inside 0 to 1000, and drops a bad one", () => {
    const text = JSON.stringify({
      track: [
        { t: 0, label: "person", box_2d: [1, 1, 9, 9], mask: [[100, 200], [150, 300], [900, 250]] },
        { t: 1, label: "person", box_2d: [1, 1, 9, 9], mask: [[100, 200], [1200, 300], [900, 250]] },
        { t: 2, label: "person", box_2d: [1, 1, 9, 9], mask: [[100, 200], [150, 300]] },
        { t: 3, label: "person", box_2d: null, mask: null },
      ],
    });
    const m = parseMaskReply(text, [0, 1, 2, 3]);
    expect([...(m?.keys() ?? [])]).toEqual([0]);
    expect(m?.get(0)).toEqual([[100, 200], [150, 300], [900, 250]]);
  });

  it("gives null for a reply that is not JSON", () => {
    expect(parseMaskReply('{"track": [{"t": 0, "mask": [[1,', [0])).toBeNull();
  });
});

function stored(over: Partial<StoredClipReading> = {}): StoredClipReading {
  return {
    sha256: SHA, storagePath: `clips/drill-test-1/${SHA}.mp4`, durationS: 9, clipStartMs: 0, clockConfirmed: true, cameraFacingDeg: null,
    reading: {}, route: null, consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: MARK, publicUse: null },
    expiresAtMs: 10_000_000, createdAtMs: 0, createdByUid: "u", ...over,
  } as StoredClipReading;
}
const MARK = { byUid: "u", atMs: 0 };

type Call = { kind: "boxes" | "masks"; ts: number[] };

function setup(opts: { durationS?: number; boxes?: (ts: number[]) => { text: string; finishReason?: string }; masks?: (ts: number[]) => { text: string; finishReason?: string }; record?: StoredClipReading | null; killCloud?: () => boolean; withMasks?: boolean } = {}) {
  const calls: Call[] = [];
  const tsOf = (parts: { text?: string }[]) => parts.flatMap((p) => (p.text?.startsWith("t=") ? [Number(p.text.slice(2))] : []));
  const box = (t: number) => ({ t, label: "person", box_2d: [100, 100 + t, 900, 200 + t] });
  let clock = 1_000;
  const deps: TrackReadDeps = {
    confirmReading: async () => (opts.record === undefined ? stored() : opts.record),
    frameJpeg: async (atS) => `jpeg@${atS.toFixed(3)}`,
    boxes: async (parts) => {
      const ts = tsOf(parts as { text?: string }[]);
      calls.push({ kind: "boxes", ts });
      return opts.boxes ? opts.boxes(ts) : { text: JSON.stringify({ track: ts.map(box) }), finishReason: "STOP" };
    },
    masks: async (parts) => {
      const ts = tsOf(parts as { text?: string }[]);
      calls.push({ kind: "masks", ts });
      return opts.masks ? opts.masks(ts) : { text: JSON.stringify({ track: ts.map((t) => ({ ...box(t), mask: [[100, 150], [500, 190], [900, 160]] })) }), finishReason: "STOP" };
    },
    nowMs: () => (clock += 250),
  };
  const durationS = opts.durationS ?? 9;
  const req: TrackReadRequest = { sha256: SHA, model: "gemini-3.5-flash-lite", durationS, window: { startS: 0, endS: durationS }, frameS: 1 / 30, killCloud: opts.killCloud ?? (() => false), withMasks: opts.withMasks ?? true };
  return { deps, req, calls };
}

describe("readClipTrack", () => {
  it("reads every frame's box in one call, then the outlines six frames at a time, and keeps both", async () => {
    const { deps, req, calls } = setup();
    const o = await readClipTrack(req, deps);
    expect(o.kind).toBe("read");
    if (o.kind !== "read") return;
    expect(calls.map((c) => [c.kind, c.ts.length])).toEqual([["boxes", 10], ["masks", 6], ["masks", 4]]);
    expect(o.track.version).toBe(CLIP_TRACK_VERSION);
    expect(o.track.entries.map((e) => e.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(o.track.entries.every((e) => e.mask?.length === 3)).toBe(true);
    expect(o.framesSent).toBe(10);
    expect(o.route).toMatchObject({ platform: "web", path: "cloud", model: "gemini-3.5-flash-lite", reason: "sdk_only_in_cloud" });
  });

  it("splits more than 40 frames into calls of at most 40 and joins them", async () => {
    // 45.2 s: whole seconds 0 to 45 (46 frames); the last frame (45.17 s) is within half a second of 45.
    const { deps, req, calls } = setup({ durationS: 45.2, withMasks: false });
    const o = await readClipTrack(req, deps);
    expect(calls.map((c) => c.ts.length)).toEqual([TRACK_BOX_FRAMES_PER_CALL, 46 - TRACK_BOX_FRAMES_PER_CALL]);
    expect(o.kind === "read" && o.track.entries.length).toBe(46);
  });

  it("fails the whole track when a box reply stops at its token cap, and asks for no outlines", async () => {
    const { deps, req, calls } = setup({ boxes: () => ({ text: '{"track": [{"t": 0', finishReason: "MAX_TOKENS" }) });
    expect(await readClipTrack(req, deps)).toEqual({ kind: "failed", reason: "max_tokens" });
    expect(calls.map((c) => c.kind)).toEqual(["boxes"]);
  });

  it("fails the whole track on a box reply that breaks a rule", async () => {
    const { deps, req } = setup({ boxes: (ts) => ({ text: JSON.stringify({ track: ts.map((t) => ({ t, label: "person", box_2d: [100, 100, 1200, 200] })) }), finishReason: "STOP" }) });
    expect(await readClipTrack(req, deps)).toEqual({ kind: "failed", reason: "invalid" });
  });

  it("keeps the boxes when one outline call fails, with no outline for its frames only", async () => {
    let n = 0;
    const { deps, req } = setup({ masks: (ts) => (++n === 1 ? { text: '{"track": [', finishReason: "MAX_TOKENS" } : { text: JSON.stringify({ track: ts.map((t) => ({ t, label: "person", box_2d: [1, 1, 9, 9], mask: [[1, 1], [5, 5], [9, 1]] })) }), finishReason: "STOP" }) });
    const o = await readClipTrack(req, deps);
    expect(o.kind).toBe("read");
    if (o.kind !== "read") return;
    expect(o.track.entries.filter((e) => e.mask).map((e) => e.t)).toEqual([6, 7, 8, 9]);
    expect(o.track.entries).toHaveLength(10);
  });

  it("asks for outlines only on frames that have a box", async () => {
    const { deps, req, calls } = setup({ boxes: (ts) => ({ text: JSON.stringify({ track: ts.map((t) => ({ t, label: "person", box_2d: t < 3 ? null : [100, 100, 900, 200] })) }), finishReason: "STOP" }) });
    await readClipTrack(req, deps);
    expect(calls.filter((c) => c.kind === "masks").flatMap((c) => c.ts)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("sends nothing when the consent record is gone, expired or missing a consent", async () => {
    for (const record of [null, stored({ expiresAtMs: 0 }), stored({ consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: null, publicUse: null } })]) {
      const { deps, req, calls } = setup({ record });
      expect((await readClipTrack(req, deps)).kind).toBe("refused");
      expect(calls).toEqual([]);
    }
  });

  it("sends nothing while clip reading is paused", async () => {
    const { deps, req, calls } = setup({ killCloud: () => true });
    expect((await readClipTrack(req, deps)).kind).toBe("refused");
    expect(calls).toEqual([]);
  });

  it("reports only the status number of a refused call", async () => {
    const { deps, req } = setup();
    deps.boxes = async () => {
      throw Object.assign(new Error("quota text"), { customErrorData: { status: 429 } });
    };
    expect(await readClipTrack(req, deps)).toEqual({ kind: "failed", reason: "error", status: 429 });
  });
});

describe("the per-call frame limits", () => {
  it("match what the spike measured fits a 2048-token reply", () => {
    expect([TRACK_BOX_FRAMES_PER_CALL, TRACK_MASK_FRAMES_PER_CALL]).toEqual([40, 6]);
  });
});

describe("clipTrackParams", () => {
  it("reads only in the cloud with the track schema, a 2048-token cap and no thinking level", () => {
    const p = clipTrackParams("gemini-3.5-flash-lite", false);
    expect(p.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(p.inCloudParams?.model).toBe("gemini-3.5-flash-lite");
    expect(p.inCloudParams?.generationConfig).toEqual({ responseMimeType: "application/json", responseJsonSchema: TRACK_JSON, maxOutputTokens: 2048 });
  });

  it("uses the outline schema on a mask read", () => {
    expect(clipTrackParams("gemini-3.5-flash-lite", true).inCloudParams?.generationConfig?.responseJsonSchema).toBe(MASK_JSON);
  });
});
