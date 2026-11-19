/// <reference types="node" />

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildPrintModel } from "../print/printModel";
import { drillView, planFixture } from "../testdata/fixtures";
import { radioCards, SAY_LINES } from "./radioCard";

const model = buildPrintModel({
  view: drillView, plans: [planFixture(5)], code: "K7Q4", eventCount: 14,
  nowMs: Date.parse("2026-11-22T19:03:00Z"),
});

it("one card per team, in team order", () => {
  const cards = radioCards(model, { sayLines: false });
  expect(cards.map(({ teamName }) => teamName)).toEqual(["Bravo", "Alfa"]);
  expect(cards[1]).toMatchObject({
    drillLine: "Training drill. Nobody is missing.", incidentName: "Oak Park",
    segmentIds: ["AA"], taskText: "Search AA on plan 5.",
    matchMeaning: "Same code means the same prior version and the same reports.",
  });
  expect(cards[1]?.planLine).toContain("2026");
  expect(cards[1]?.planLine).toContain("v5");
});

it('a team with no assignment gets a card that says "No assignment yet."', () => {
  expect(radioCards(model, { sayLines: false })[0]).toMatchObject({ segmentIds: [], taskText: "No assignment yet." });
});

it("the spell table has the 32 match code characters and no I, L, O or U", () => {
  const table = radioCards(model, { sayLines: false })[0]?.spellTable ?? [];
  expect(table.map(({ ch }) => ch).join("")).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
  expect(table).toContainEqual({ ch: "K", word: "Kilo" });
  expect(table).toContainEqual({ ch: "7", word: "Seven" });
});

it("say lines are left out when the option is off", () => {
  expect(radioCards(model, { sayLines: false }).map(({ sayLines }) => sayLines)).toEqual([[], []]);
  expect(radioCards(model, { sayLines: true })[0]?.sayLines).toEqual(SAY_LINES);
});

it("every feature and direction word in the say lines is in the report schema", () => {
  const schemaPath = new URL("../../../../shared/schemas/report-reading.schema.json", import.meta.url);
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  expect(SAY_LINES).toHaveLength(5);
  for (const field of ["feature", "direction"] as const) {
    const examples = Array.from(SAY_LINES.join("\n").matchAll(new RegExp(`${field} \\[([^\\]]+)\\]`, "gi")), (match) => match[1]);
    expect(examples.length).toBeGreaterThan(0);
    for (const word of examples) expect(schema.properties[field].enum).toContain(word);
  }
});

it("the card holds no uid and no profile field", () => {
  const privateFields = {
    uid: "private-marker", joinCode: "private-marker", rawText: "private-marker",
    profile: { command: "private-marker" }, clipPath: "private-marker", consent: "private-marker",
  };
  const cards = radioCards({
    ...model, ...privateFields,
    teams: model.teams.map((team) => ({ ...team, ...privateFields, reason: "private-marker" })),
  }, { sayLines: true });
  expect(cards).toHaveLength(2);
  expect(JSON.stringify(cards)).not.toMatch(/uid|joinCode|rawText|profile|clipPath|consent|private-marker/i);
});

it("every card carries the incident's training line, in a practice search too", () => {
  const practice = "Training drill. Practice search; nobody is missing.";
  const cards = radioCards({ ...model, mode: "judge", drillLabel: practice }, { sayLines: false });
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) expect(card.drillLine).toBe(practice);
});

