import { expect, it } from "vitest";
import { printableApproachLines } from "../hostApp";
import { drillView, planFixture } from "../testdata/fixtures";
import { buildPrintModel, type PrintModel } from "./printModel";
import { defaultTyped, ics204Sheets, ICS204_BLOCK_TITLES, ICS204_RESOURCE_COLUMNS } from "./ics204";

const timeZone = "America/New_York";
const model = buildPrintModel({
  view: drillView, plans: [planFixture(5)], code: "K7Q4", eventCount: 14,
  nowMs: Date.parse("2026-11-22T19:03:00Z"),
});
const notes = ["Come from the front. Speak softly. Be patient."];

function sheets(printModel: PrintModel = model) {
  return ics204Sheets(printModel, defaultTyped(printModel, timeZone), notes, timeZone);
}

it("block titles match the FEMA form, in order", () => {
  expect(ICS204_BLOCK_TITLES).toEqual([
    "Incident Name", "Operational Period", "Branch, Division, Group, Staging Area", "Operations Personnel",
    "Resources Assigned", "Work Assignments", "Special Instructions",
    "Communications (radio and/or phone contact numbers needed for this assignment)", "Prepared by",
  ]);
});

it("block 5 has the form's five column titles", () => {
  expect(ICS204_RESOURCE_COLUMNS).toEqual([
    "Resource Identifier", "Leader", "# of Persons", "Contact (e.g., phone, pager, radio frequency, etc.)",
    "Reporting Location, Special Equipment and Supplies, Remarks, Notes, Information",
  ]);
});

it("one resource row per team; the identifier is the team name; the notes hold the segment ids", () => {
  expect(sheets()[0]?.resources.map(({ resourceIdentifier, notes }) => [resourceIdentifier, notes])).toEqual([
    ["Bravo", ""], ["Alfa", "AA"],
  ]);
  expect(sheets()[0]?.workAssignments[1]).toContain("Alfa");
  expect(sheets()[0]?.workAssignments[1]).toContain("Search AA on plan 5.");
});

it("leader, persons and contact stay blank for a pen", () => {
  expect(sheets()[0]?.resources.map(({ leader, persons, contact }) => [leader, persons, contact])).toEqual([
    ["", "", ""], ["", "", ""],
  ]);
});

it("eleven teams make three sheets of at most five; each carries the incident name; pages read 1 to 3 of 3", () => {
  const teams = Array.from({ length: 11 }, (_, index) => ({ ...model.teams[1]!, name: `Team ${index + 1}` }));
  const pages = sheets({ ...model, teams });

  expect(pages.map(({ incidentName, page, pages }) => [incidentName, page, pages])).toEqual([
    ["Oak Park", 1, 3], ["Oak Park", 2, 3], ["Oak Park", 3, 3],
  ]);
  expect(pages.map(({ resources }) => resources.length)).toEqual([5, 5, 1]);
  expect(pages[2]?.workAssignments).toEqual([expect.stringContaining("Team 11")]);
});

it("block 7 starts with the incident's training line in every mode", () => {
  expect(sheets()[0]?.specialInstructions[0]).toBe("Training drill. Nobody is missing. Do not dial 911.");
  const practice = "Training drill. Practice search; nobody is missing.";
  expect(sheets({ ...model, mode: "judge", drillLabel: practice })[0]?.specialInstructions[0]).toBe(`${practice} Do not dial 911.`);
});

it("block 7 carries the match code line", () => {
  expect(sheets()[0]?.specialInstructions).toContain("Map match code at print time: K7Q4 (plan v5, 14 reports).");
});

it("approach notes appear only when ticked", () => {
  expect(sheets()[0]?.specialInstructions).not.toContain(notes[0]);
  const typed = { ...defaultTyped(model, timeZone), includeApproachNotes: true };
  expect(ics204Sheets(model, typed, notes, timeZone)[0]?.specialInstructions).toContain(notes[0]);
});

it("the prepared time is month/day/year and 24-hour", () => {
  expect(sheets()[0]?.preparedDateTime).toBe("11/22/2026 14:03");
  const approved = { ...model, planApprovedAtMs: Date.parse("2026-11-22T05:00:00Z") };
  expect(defaultTyped(approved, timeZone)).toEqual({
    dateFrom: "11/22/2026", timeFrom: "00:00", dateTo: "", timeTo: "",
    branch: "", division: "", group: "", stagingArea: "", includeApproachNotes: false,
  });
});

it("no approved plan gives no sheet", () => {
  expect(sheets({ ...model, planVersion: null, planApprovedAtMs: null })).toEqual([]);
});

it("no sheet holds a uid", () => {
  const privateFields = {
    uid: "private-marker", joinCode: "private-marker", rawText: "private-marker",
    profile: { command: "private-marker" }, clipPath: "private-marker", consent: { byUid: "private-marker" },
  };
  const privateModel = {
    ...model, ...privateFields,
    teams: model.teams.map((team) => ({ ...team, ...privateFields, reason: "private-marker" })),
  };
  const typed = { ...defaultTyped(model, timeZone), ...privateFields };
  const output = ics204Sheets(privateModel, typed, notes, timeZone);
  expect(output).toHaveLength(1);
  expect(JSON.stringify(output)).not.toMatch(/uid|joinCode|rawText|profile|clipPath|consent|private-marker/i);
});

it("the approach note source excludes private text and unknown ids", () => {
  expect(printableApproachLines(["language", "triggers", "best_approach", "unique", "__proto__", "approach_calm"])).toEqual(notes);
});

it("paper never carries a health, mobility or safety note, even when ticked", () => {
  const health = ["seizures", "medication_alert", "medication_timing", "fall_risk", "gait_unsteady", "freezing", "may_strike_out", "fluctuates"];
  expect(printableApproachLines(health)).toEqual([]);
  expect(printableApproachLines([...health, "approach_calm"])).toEqual(notes);
});
