import { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let docs: { id: string; data: Record<string, unknown> }[] = [];
let bytes = new Uint8Array();
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  getDocs: async () => {
    calls.push("cache-or-server");
    return { docs: [] };
  },
  getDocsFromServer: async (c: { path: string }) => {
    calls.push(`server ${c.path}`);
    return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
  },
}));
vi.mock("firebase/storage", async (orig) => ({
  ...(await orig<typeof import("firebase/storage")>()),
  ref: (_s: unknown, path: string) => ({ path }),
  getBytes: async (r: { path: string }, max: number) => {
    calls.push(`bytes ${r.path} ${max}`);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  },
}));

const { listStoredClips, loadStoredClip, CLIP_CHANGED } = await import("./storedClips");
const { sha256Hex } = await import("./photos");

const MARK = { byUid: "u", atMs: 0 };
const SIGHTING = {
  personVisible: true, firstSeen: "00:01", lastSeen: "00:05", entryEdge: "right", exitEdge: "left",
  topColor: "blue", bottomColor: "black", topType: "rain jacket", footwear: "boots", headwear: "none",
  carriedItems: [], keyFrame: { time: "00:04", box2d: [100, 200, 900, 400] },
  lighting: "day", legibility: "clear", evidence: "An adult in a blue jacket walks from right to left.",
};
const record = (sha: string, over: Record<string, unknown> = {}) => ({
  sha256: sha, storagePath: `clips/drill-test-1/${sha}.mp4`, durationS: 9, clipStartMs: 1_000, clockConfirmed: true, cameraFacingDeg: 90,
  reading: SIGHTING, route: null, consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: MARK, publicUse: null },
  expiresAt: Timestamp.fromMillis(9_000_000_000_000), createdAt: Timestamp.fromMillis(1), createdByUid: "u", ...over,
});

beforeEach(() => {
  calls.length = 0;
  docs = [];
  bytes = new Uint8Array();
});

describe("listStoredClips", () => {
  it("reads this search's clip records from the server and keeps the ones read as a sighting, newest first", async () => {
    docs = [
      { id: "a".repeat(64), data: record("a".repeat(64), { clipStartMs: 1_000 }) },
      { id: "b".repeat(64), data: record("b".repeat(64), { reading: null }) },
      { id: "c".repeat(64), data: record("c".repeat(64), { reading: { status: "no_sighting", reasons: [] } }) },
      { id: "d".repeat(64), data: record("d".repeat(64), { clipStartMs: 5_000 }) },
      { id: "e".repeat(64), data: { sha256: "e".repeat(64) } },
      { id: "f".repeat(64), data: record("a".repeat(64)) },
    ];
    const got = await listStoredClips({} as never, "drill-test-1");
    expect(got.map((c) => c.record.sha256)).toEqual(["d".repeat(64), "a".repeat(64)]);
    expect(got[0]!.sighting.keyFrame.time).toBe("00:04");
    expect(calls).toEqual(["server incidents/drill-test-1/clipReadings"]);
  });
});

describe("loadStoredClip", () => {
  it("downloads the clip at its own path, up to 14 MB, and hands it back when its SHA-256 matches its name", async () => {
    bytes = new Uint8Array([1, 2, 3, 4]);
    const sha = await sha256Hex(bytes);
    expect([...(await loadStoredClip({} as never, "drill-test-1", sha))]).toEqual([1, 2, 3, 4]);
    expect(calls).toEqual([`bytes clips/drill-test-1/${sha}.mp4 14000000`]);
  });

  it("refuses bytes whose SHA-256 is not the clip's name", async () => {
    bytes = new Uint8Array([1, 2, 3, 4]);
    await expect(loadStoredClip({} as never, "drill-test-1", "a".repeat(64))).rejects.toThrow(CLIP_CHANGED);
  });

  it("downloads nothing for a name that is not a SHA-256 or an incident id with a slash", async () => {
    await expect(loadStoredClip({} as never, "drill-test-1", "../x")).rejects.toThrow();
    await expect(loadStoredClip({} as never, "a/b", "a".repeat(64))).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
