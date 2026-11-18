import { describe, expect, it } from "vitest";
import { fitWithin } from "./jpeg";

describe("fitWithin", () => {
  it("scales the long side down to 1536 and keeps the shape", () => {
    expect(fitWithin(4032, 3024, 1536)).toEqual({ width: 1536, height: 1152 });
    expect(fitWithin(3024, 4032, 1536)).toEqual({ width: 1152, height: 1536 });
  });

  it("never scales a small photo up", () => {
    expect(fitWithin(800, 600, 1536)).toEqual({ width: 800, height: 600 });
  });

  it("refuses an empty image", () => {
    expect(() => fitWithin(0, 600, 1536)).toThrow();
  });
});
