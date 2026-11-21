import { describe, expect, it } from "vitest";
import { flagLine, reportFromDoc, sortNewestFirst } from "./contentReports";

const doc = (over: Record<string, unknown> = {}) => ({
  authorUid: "u1", role: "searcher", target: "event", targetId: "a".repeat(32), reason: "personal_information",
  createdAt: { toMillis: () => 1_700_000_000_000 }, ...over,
});

describe("content reports for command", () => {
  it("reads a stored report and refuses one that is not of the schema's shape", () => {
    expect(reportFromDoc("r1", doc())).toMatchObject({ reportId: "r1", target: "event", reason: "personal_information", createdAtMs: 1_700_000_000_000 });
    expect(reportFromDoc("r2", doc({ reason: "spam" }))).toBeNull();
    expect(reportFromDoc("r3", doc({ target: "map" }))).toBeNull();
    expect(reportFromDoc("r4", doc({ role: "command" }))).toBeNull();
    expect(reportFromDoc("r5", doc({ createdAt: undefined }))).toMatchObject({ createdAtMs: null });
  });
  it("says who flagged what and why, in few words", () => {
    expect(flagLine(reportFromDoc("r1", doc())!, "Team 1 searcher")).toBe("Team 1 searcher flagged a report: personal information that should not be shared.");
    expect(flagLine(reportFromDoc("r1", doc({ role: "family", target: "family_description", targetId: null, reason: "wrong_or_misleading" }))!, "Family member"))
      .toBe("Family member flagged the family's description: wrong or misleading.");
    expect(flagLine(reportFromDoc("r1", doc({ target: "task", targetId: "p1", reason: "abusive" }))!, "Team 2 searcher")).toBe("Team 2 searcher flagged their task: abusive or offensive.");
    expect(flagLine(reportFromDoc("r1", doc({ reason: "other" }))!, "Team 1 searcher")).toBe("Team 1 searcher flagged a report: other.");
  });
  it("lists the newest first", () => {
    const a = reportFromDoc("a", doc({ createdAt: { toMillis: () => 1 } }))!;
    const b = reportFromDoc("b", doc({ createdAt: { toMillis: () => 3 } }))!;
    expect(sortNewestFirst([a, b]).map((r) => r.reportId)).toEqual(["b", "a"]);
  });
});

describe("content reports, after review", () => {
  it("never shows a phone number from a note", () => {
    const f = reportFromDoc("r1", doc({ note: "Wrong: call (404) 555-0142 for her" }))!;
    expect(f.note).toBe("Wrong: call [number removed] for her");
  });
  it("puts a report with no stored time last (command writes none, so none is ever pending)", () => {
    const a = reportFromDoc("a", doc({ createdAt: { toMillis: () => 1 } }))!;
    const b = reportFromDoc("b", doc({ createdAt: undefined }))!;
    const c = reportFromDoc("c", doc({ createdAt: { toMillis: () => 3 } }))!;
    expect(sortNewestFirst([a, b, c]).map((r) => r.reportId)).toEqual(["c", "a", "b"]);
  });
  it("names the flagged report or task when it is on hand", async () => {
    const { flagTarget } = await import("./contentReports");
    const { planDocId } = await import("./plans");
    const at = (ms: number) => new Date(ms).toISOString().slice(11, 16);
    const ev = { eventId: "a".repeat(32), clientTimeMs: Date.UTC(2026, 10, 22, 4, 21), reading: { segmentIds: ["AE"] } };
    expect(flagTarget(reportFromDoc("r", doc())!, [ev], [], at)).toBe("a report from 04:21 in segment AE");
    expect(flagTarget(reportFromDoc("r", doc({ targetId: "b".repeat(32) }))!, [ev], [], at)).toBe("a report");
    expect(flagTarget(reportFromDoc("r", doc({ target: "task", targetId: planDocId(3) }))!, [], [{ version: 3 }], at)).toBe("their task in plan v3");
    expect(flagTarget(reportFromDoc("r", doc({ target: "task", targetId: "x" }))!, [], [{ version: 3 }], at)).toBe("their task");
    expect(flagTarget(reportFromDoc("r", doc({ target: "family_description", targetId: null }))!, [], [], at)).toBe("the family's description");
  });
});

describe("content reports, second round", () => {
  it("names the team of the account's latest report by server time, skipping reports with no time", async () => {
    const { latestTeamOf } = await import("./contentReports");
    const events = [
      { authorUid: "u1", teamId: "T9", clientTimeMs: undefined, serverTimeMs: null },
      { authorUid: "u1", teamId: "T1", clientTimeMs: 5_000, serverTimeMs: 1_000 },
      { authorUid: "u1", teamId: "T2", clientTimeMs: 1_000, serverTimeMs: 2_000 },
      { authorUid: "u2", teamId: "T3", clientTimeMs: 9_000, serverTimeMs: 9_000 },
    ];
    expect(latestTeamOf("u1", events)).toBe("T2");
    expect(latestTeamOf("nobody", events)).toBeNull();
  });
});
