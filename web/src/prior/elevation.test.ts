import { describe, expect, it } from "vitest";
import { loadElevationM } from "./elevation";

const file = (over: Record<string, unknown> = {}) => ({
  gridId: "kennesaw-mountain-drill", gridSha256: "a".repeat(64), source: "USGS 3DEP", license: "public domain", credit: "USGS",
  fetchedAt: "2026-11-19", samplesPerCell: 9, units: "metres",
  cells: { AA: { meanM: 310.5, minM: 300, maxM: 320, n: 9 }, AB: { meanM: 290, minM: 285, maxM: 296, n: 9 } }, ...over,
});

describe("loadElevationM: each segment's mean elevation from the site's elevation file", () => {
  it("gives the mean per segment for this grid's file", async () => {
    expect(await loadElevationM("kennesaw-mountain-drill", async () => file())).toEqual({ AA: 310.5, AB: 290 });
  });
  it("gives null when the site has no file, the file is another grid's, broken, or will not load", async () => {
    expect(await loadElevationM("kennesaw-mountain-drill", async () => null)).toBeNull();
    expect(await loadElevationM("piedmont-park-dev", async () => file())).toBeNull();
    expect(await loadElevationM("kennesaw-mountain-drill", async () => file({ units: "feet" }))).toBeNull();
    expect(await loadElevationM("kennesaw-mountain-drill", async () => { throw new Error("offline"); })).toBeNull();
  });
});
