import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApproachCard } from "../command/ApproachCard";
import { approachLines, commandFromDoc, sharedFromDoc } from "./profile";

describe("reading a partial profile (the rules allow partial writes)", () => {
  it("fills every missing shared field with its empty value", () => {
    const s = sharedFromDoc({ nickname: "Bea" });
    expect(s.nickname).toBe("Bea");
    expect(s.answersTo).toBe("");
    expect(s.approachNoteIds).toEqual([]);
    expect(s.mobilityAids).toEqual([]);
    expect(s.ageYears).toBeNull();
    expect(s.dementiaType).toBeNull();
    expect(Object.values(s.flags).every((v) => v === false)).toBe(true);
    expect(Object.keys(s.flags).length).toBeGreaterThan(10);
  });

  it("treats a wrong-typed array or map as empty", () => {
    const s = sharedFromDoc({ approachNoteIds: null, mobilityAids: "cane", flags: "x", ageYears: "70" });
    expect(s.approachNoteIds).toEqual([]);
    expect(s.mobilityAids).toEqual([]);
    expect(s.ageYears).toBeNull();
    expect(Object.values(s.flags).every((v) => v === false)).toBe(true);
  });

  it("renders the command view's approach card from a nickname-only document", () => {
    const s = sharedFromDoc({ nickname: "Bea" });
    expect(approachLines(s)).toEqual({ first: [], more: [] });
    expect(renderToString(<ApproachCard shared={s} photoOld={false} />)).toContain("Who and how to approach");
  });

  it("fills every missing command-only field with its empty value", () => {
    const c = commandFromDoc({ nearbyWater: "pond" });
    expect(c).toEqual({ previousAddresses: [], placesFrequented: [], pastWandering: [], nearbyWater: "pond", vehicle: null });
  });
});
