import { expect, it } from "vitest";
import { mulberry32 } from "../src/index";

it("mulberry32 is deterministic and stays in [0, 1)", () => {
  const a = mulberry32(42), b = mulberry32(42);
  const xs = Array.from({ length: 1000 }, () => a());
  expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...xs)).toBeLessThan(1);
});
