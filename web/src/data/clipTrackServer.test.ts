import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  getDoc: async () => {
    calls.push("cache-or-server");
    return { exists: () => false, data: () => undefined };
  },
  getDocFromServer: async () => {
    calls.push("server");
    return { exists: () => false, data: () => undefined };
  },
}));

const { findClipTrack } = await import("./clipTrack");

describe("findClipTrack", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("reads the track from the server, never from this device's cache", async () => {
    expect(await findClipTrack({} as never, "drill-test-1", "a".repeat(64))).toBeNull();
    expect(calls).toEqual(["server"]);
  });
});
