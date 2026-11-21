// Drill-day paper for the Kennesaw Mountain drill: the assignment sheet and radio cards built from that drill's
// teams (T1 to T3) and a plan over real segment ids from its grid. Made-up drill data; the ids must exist in the grid.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { radioCards } from "../radio/radioCard";
import { kennesawPlan, kennesawView } from "../testdata/kennesaw";
import { defaultTyped, ics204Sheets } from "./ics204";
import { buildPrintModel } from "./printModel";

const gridFile = fileURLToPath(new URL("../../../../shared/grid/kennesaw-mountain-drill.grid.json", import.meta.url));
const gridIds = new Set((JSON.parse(readFileSync(gridFile, "utf8")) as { segments: { segmentId: string }[] }).segments.map((s) => s.segmentId));

function model() {
  return { ...buildPrintModel({ view: kennesawView, plans: [kennesawPlan], code: "K7Q4", eventCount: 0, nowMs: Date.UTC(2026, 10, 22, 13, 0) }), matchCode: "K7Q4", reportCount: 0, printedAtMs: Date.UTC(2026, 10, 22, 13, 0) };
}

it("plans only segments that exist on the Kennesaw grid", () => {
  const ids = kennesawPlan.assignments.flatMap((a) => a.segmentIds);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(gridIds.has(id), id).toBe(true);
});

it("prints one assignment sheet with T1, T2 and T3, their segments, and the training line first in block 7", () => {
  const m = model();
  const sheets = ics204Sheets(m, defaultTyped(m, "UTC"), [], "UTC");
  expect(sheets).toHaveLength(1);
  const sheet = sheets[0]!;
  expect(sheet.specialInstructions[0]).toBe("Training drill. Nobody is missing. Do not dial 911.");
  for (const a of kennesawPlan.assignments) {
    expect(sheet.workAssignments.join("\n")).toContain(a.segmentIds.join(", "));
  }
  expect(sheet.workAssignments).toHaveLength(3);
});

it("prints one radio card per team, each with the training line, its segments and plan v1", () => {
  const cards = radioCards(model(), { timeZone: "America/New_York", sayLines: false });
  expect(cards.map((c) => c.teamName)).toEqual(["T1", "T2", "T3"]);
  for (const card of cards) {
    expect(card.drillLine).toBe("Training drill. Nobody is missing.");
    expect(card.segmentIds.length).toBe(3);
    expect(card.planLine).toContain("Plan v1");
  }
});
