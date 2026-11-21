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
  it("lists the newest first; one still being saved (no server time) comes first", () => {
    const a = reportFromDoc("a", doc({ createdAt: { toMillis: () => 1 } }))!;
    const b = reportFromDoc("b", doc({ createdAt: { toMillis: () => 3 } }))!;
    const c = reportFromDoc("c", doc({ createdAt: null }))!;
    expect(sortNewestFirst([a, b, c]).map((r) => r.reportId)).toEqual(["c", "b", "a"]);
  });
});

describe("content reports, after review", () => {
  it("never shows a phone number from a note", () => {
    const f = reportFromDoc("r1", doc({ note: "Wrong: call (404) 555-0142 for her" }))!;
    expect(f.note).toBe("Wrong: call [number removed] for her");
  });
});
