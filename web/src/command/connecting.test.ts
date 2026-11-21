import { describe, expect, it } from "vitest";
import { connectingLine } from "./connecting";

describe("what the post says while it reconnects to a linked incident", () => {
  it("names a practice search as one", () => {
    expect(connectingLine("judge-u1-0123456789ab")).toBe("Opening practice search");
  });

  it("names any other linked incident by its id", () => {
    expect(connectingLine("drill-test-1")).toBe("Opening incident drill-test-1");
  });

  it("says nothing without a linked incident, so the join form shows as before", () => {
    expect(connectingLine(null)).toBeNull();
    expect(connectingLine("")).toBeNull();
  });
});
