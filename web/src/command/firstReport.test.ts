import { readFileSync } from "node:fs";
import type { EventDoc } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { FIRST_REPORT_LINE, FIRST_REPORT_SEGMENT, firstReportInput, offerFirstReport } from "./firstReport";

// The practice search's grid (the seed drill copies it), so the card's words are checked against the real map.
const grid = JSON.parse(readFileSync(new URL("../../../shared/grid/piedmont-park-dev.grid.json", import.meta.url), "utf8")) as {
  bbox: [number, number, number, number];
  segments: { segmentId: string; centroid: { lat: number; lon: number } }[];
};
const ev = (type: string) => ({ type }) as unknown as EventDoc;

describe("the practice search's one-click first report", () => {
  it("is offered on a practice search until command has confirmed or rejected any report", () => {
    expect(offerFirstReport("judge-u1-0123456789ab", [ev("sighting"), ev("clue")])).toBe(true);
    expect(offerFirstReport("judge-u1-0123456789ab", [ev("sighting"), ev("confirmation")])).toBe(false);
    expect(offerFirstReport("drill-test-1", [])).toBe(false);
  });

  it("says where it is, and the place is true on the practice grid: segment CD, at the park's south end", () => {
    expect(FIRST_REPORT_LINE).toBe("A park worker saw a man in a blue coat at the south end of the park, in segment CD, 10 minutes ago.");
    const cd = grid.segments.find((s) => s.segmentId === FIRST_REPORT_SEGMENT)!;
    const [, south, , north] = grid.bbox;
    expect((cd.centroid.lat - south) / (north - south)).toBeLessThan(0.25);
  });

  it("is a sighting at CD's centre, seen 10 minutes before now, in a blue top, from park staff, labelled a drill inject", () => {
    const now = Date.UTC(2026, 10, 21, 12, 0, 0);
    const input = firstReportInput(grid.segments, now)!;
    expect(input.position).toEqual(grid.segments.find((s) => s.segmentId === "CD")!.centroid);
    expect(input.observedAtMs).toBe(now - 10 * 60_000);
    expect(input).toMatchObject({ topColor: "blue", bottomColor: "unknown", direction: "unknown", reportedBy: "staff" });
    expect(input.freeText).toBe("Training drill inject. A man in a blue coat at the south end of the park, 10 minutes ago.");
    expect(input.readFilled).toBeUndefined();
  });

  it("is not offered as a report where the grid has no segment CD", () => {
    expect(firstReportInput([{ segmentId: "AA", centroid: { lat: 1, lon: 2 } }], 0)).toBeNull();
  });
});
