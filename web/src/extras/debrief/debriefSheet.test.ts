import { describe, expect, it } from "vitest";
import type { PrintModel } from "../print/printModel";
import { COVERAGE_TICKS, DEBRIEF_FIELDS, debriefSheets, SAMPLE_VALUES, sampleDebriefSheet } from "./debriefSheet";

const model: PrintModel = {
  incidentName: "Oak Park",
  mode: "drill",
  drillLabel: "Training drill. Nobody is missing.",
  planVersion: 3,
  planApprovedAtMs: 1_795_372_900_000,
  teams: [
    { teamId: "alfa", name: "Alfa", segmentIds: ["AA", "AB"], taskText: "", reason: "" },
    { teamId: "bravo", name: "Bravo", segmentIds: ["BB"], taskText: "", reason: "" },
    { teamId: "charlie", name: "Charlie", segmentIds: [], taskText: "", reason: "" },
  ],
  matchCode: "K7Q4",
  reportCount: 4,
  printedAtMs: 1_795_373_000_000,
};

describe("debriefSheets", () => {
  it("prints one sheet per segment each team was given, with team and segment typed, then the blank sheets", () => {
    const sheets = debriefSheets(model, { blanks: 2 });
    expect(sheets.map((s) => [s.teamName, s.segmentId])).toEqual([["Alfa", "AA"], ["Alfa", "AB"], ["Bravo", "BB"], [null, null], [null, null]]);
    expect(sheets.map((s) => s.pageLine)).toEqual(["1 of 5", "2 of 5", "3 of 5", "4 of 5", "5 of 5"]);
    expect(sheets.every((s) => s.drillLine === "Training drill. Nobody is missing." && s.incidentName === "Oak Park" && s.planLine === "Plan v3")).toBe(true);
    expect(sheets.every((s) => s.sample === null)).toBe(true);
  });

  it("with no approved plan prints only blank sheets, and says so", () => {
    const sheets = debriefSheets({ ...model, planVersion: null, teams: [] }, { blanks: 2 });
    expect(sheets.map((s) => s.segmentId)).toEqual([null, null]);
    expect(sheets[0]!.planLine).toBe("No plan approved");
  });
});

describe("the sheet's fields", () => {
  it("ask for no one's name or phone number", () => {
    for (const f of DEBRIEF_FIELDS) expect(f.label, f.key).not.toMatch(/name|phone|call/i);
  });

  it("are, in order: team, segment, minutes, coverage, what worked, what did not, clues, hazards", () => {
    expect(DEBRIEF_FIELDS.map((f) => f.key)).toEqual(["team", "segment", "minutes", "coverage", "worked", "didNotWork", "clues", "hazards"]);
  });

  it("ask for coverage as one tick of four, which reads more reliably than a handwritten number", () => {
    expect(COVERAGE_TICKS).toEqual([25, 50, 75, 100]);
  });
});

describe("sampleDebriefSheet", () => {
  it("is one filled sheet marked SAMPLE, on the first segment of the plan, with every field filled", () => {
    const s = sampleDebriefSheet(model);
    expect(s.sample).toEqual(SAMPLE_VALUES);
    expect([s.teamName, s.segmentId, s.pageLine]).toEqual(["Alfa", "AA", "SAMPLE"]);
    expect(SAMPLE_VALUES.coveragePct).toBe(75);
    for (const v of Object.values(SAMPLE_VALUES)) expect(String(v).length).toBeGreaterThan(0);
    // Made up for practice: it names no person.
    expect(JSON.stringify(SAMPLE_VALUES)).not.toMatch(/\b(Mr|Mrs|Ms)\b|\d{3}[-. ]\d{4}/);
  });
});
