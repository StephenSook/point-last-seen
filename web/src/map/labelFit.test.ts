import { describe, expect, it } from "vitest";
import { CODE_GAP_PX, cappedDotRadius, codePlace } from "./labelFit";

// A cell 60 px wide and 40 px tall, its centre at (100, 100).
const box = { left: 70, top: 80, right: 130, bottom: 120 };
const centre = { x: 100, y: 100 };

describe("cappedDotRadius", () => {
  it("keeps a dot that fits its cell", () => {
    expect(cappedDotRadius(14, box)).toBe(14);
  });

  it("caps a dot at half the smaller side of its cell on screen", () => {
    expect(cappedDotRadius(14, { left: 0, top: 0, right: 20, bottom: 40 })).toBe(10);
    expect(cappedDotRadius(14, { left: 0, top: 0, right: 40, bottom: 16 })).toBe(8);
  });
});

describe("codePlace", () => {
  it("puts the code left of its dot when it fits there inside the cell", () => {
    // Right edge at 100 - 6 - gap, left edge 20 px further left: inside 70..130.
    expect(codePlace({ code: { w: 20, h: 12 }, box, centre, dotR: 6 })).toBe("left");
  });

  it("moves the code onto the centre when it does not fit left of the dot but fits in the cell", () => {
    // Left of a 14 px dot, a 20 px code would start at 100 - 14 - gap - 20 < 70.
    expect(codePlace({ code: { w: 20, h: 12 }, box, centre, dotR: 14 })).toBe("centre");
  });

  it("hides the code only when it fits nowhere in the cell", () => {
    expect(codePlace({ code: { w: 70, h: 12 }, box, centre, dotR: 6 })).toBe("hidden");
    expect(codePlace({ code: { w: 20, h: 50 }, box, centre, dotR: 6 })).toBe("hidden");
  });

  it("reads the cell's box as it is now: zooming in brings a code back to the left of its dot", () => {
    const zoomedIn = { left: 40, top: 60, right: 160, bottom: 140 };
    expect(codePlace({ code: { w: 20, h: 12 }, box: zoomedIn, centre, dotR: 14 })).toBe("left");
  });

  it("leaves a small gap between the code and the dot", () => {
    expect(CODE_GAP_PX).toBe(3);
    // A code exactly as wide as the room left of a 6 px dot still fits; one pixel more moves it to the centre.
    const room = 100 - 6 - CODE_GAP_PX - box.left;
    expect(codePlace({ code: { w: room, h: 12 }, box, centre, dotR: 6 })).toBe("left");
    expect(codePlace({ code: { w: room + 1, h: 12 }, box, centre, dotR: 6 })).toBe("centre");
  });
});
