import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { revokedAtMs } from "./usePhotoTray";

describe("revokedAtMs", () => {
  it("reads a stored timestamp in milliseconds", () => {
    expect(revokedAtMs(Timestamp.fromMillis(1_763_510_665_790))).toBe(1_763_510_665_790);
  });
  it("is null when absent or not a timestamp", () => {
    expect(revokedAtMs(undefined)).toBeNull();
    expect(revokedAtMs("2026-11-19")).toBeNull();
    expect(revokedAtMs({})).toBeNull();
  });
});
