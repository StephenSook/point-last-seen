import { describe, expect, it } from "vitest";
import { makeSeq } from "./seq";

describe("makeSeq", () => {
  it("starts from the clock in milliseconds, so a reload or a new profile does not repeat an id", () => {
    expect(makeSeq(() => 1795860000123)()).toBe(1795860000123);
  });

  it("never repeats or goes back, even within one millisecond or when the clock steps back", () => {
    let t = 1000;
    const next = makeSeq(() => t);
    const a = next(), b = next();
    t = 900;
    const c = next();
    expect([a, b, c]).toEqual([1000, 1001, 1002]);
  });

  it("is a whole number, as the rules require", () => {
    expect(Number.isInteger(makeSeq(() => 1795860000123.7)())).toBe(true);
  });
});
