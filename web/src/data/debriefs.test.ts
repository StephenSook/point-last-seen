import { deleteField, serverTimestamp, Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { clearedSegments, debriefAuthor, debriefEdit, debriefFromDoc, newDebriefDoc, parseDebriefForm } from "./debriefs";

describe("parseDebriefForm", () => {
  it("takes whole minutes from 0 to 1440 and optional notes, trimmed", () => {
    expect(parseDebriefForm({ minutes: " 45 ", worked: " Grid lines ", didNotWork: "" })).toEqual({ ok: true, value: { tookMinutes: 45, worked: "Grid lines" } });
    expect(parseDebriefForm({ minutes: "0", worked: "", didNotWork: "Radio dead zone" })).toEqual({ ok: true, value: { tookMinutes: 0, didNotWork: "Radio dead zone" } });
  });
  it("refuses minutes that are not a whole number in range, and notes over 500 characters", () => {
    for (const minutes of ["", "1441", "-1", "2.5", "abc"]) {
      expect(parseDebriefForm({ minutes, worked: "", didNotWork: "" })).toEqual({ ok: false, message: "Time it took: a whole number of minutes, 0 to 1440." });
    }
    expect(parseDebriefForm({ minutes: "5", worked: "x".repeat(501), didNotWork: "" })).toEqual({ ok: false, message: "What worked: 500 characters at most." });
    expect(parseDebriefForm({ minutes: "5", worked: "", didNotWork: "x".repeat(501) })).toEqual({ ok: false, message: "What didn't work: 500 characters at most." });
  });
});

describe("debriefFromDoc", () => {
  it("reads a stored debrief", () => {
    expect(debriefFromDoc("AA", { tookMinutes: 30, worked: "Line search", byUid: "u1", createdAt: Timestamp.fromMillis(5), clearedEventId: null })).toEqual({
      segmentId: "AA", tookMinutes: 30, worked: "Line search", didNotWork: undefined, byUid: "u1", createdAtMs: 5, clearedEventId: null,
    });
  });
  it("is null for a document it cannot trust", () => {
    expect(debriefFromDoc("AA", { tookMinutes: "30", byUid: "u1" })).toBeNull();
    expect(debriefFromDoc("AA", { tookMinutes: 30 })).toBeNull();
  });
});

describe("writes", () => {
  it("a new debrief carries the writer, the server's time and the cleared event it belongs to", () => {
    const d = newDebriefDoc({ tookMinutes: 30, worked: "Line search" }, "u1", "a".repeat(32)) as Record<string, unknown>;
    expect(d).toMatchObject({ tookMinutes: 30, worked: "Line search", byUid: "u1", clearedEventId: "a".repeat(32) });
    expect("didNotWork" in d).toBe(false);
    expect((d["createdAt"] as ReturnType<typeof serverTimestamp>).isEqual(serverTimestamp())).toBe(true);
  });
  it("an edit changes the time and notes only, and removes a note that was cleared", () => {
    const e = debriefEdit({ tookMinutes: 20, worked: "Dogs" }) as Record<string, unknown>;
    expect(Object.keys(e).sort()).toEqual(["didNotWork", "tookMinutes", "worked"]);
    expect((e["didNotWork"] as ReturnType<typeof deleteField>).isEqual(deleteField())).toBe(true);
  });
});

describe("cleared segments and authors", () => {
  const ev = (eventId: string, segmentId: string, deviceId: string, teamId: string, t: number) =>
    ({ eventId, type: "cleared", deviceId, teamId, serverTimeMs: t, pendingWrite: false, effect: { kind: "cleared", segmentId } }) as never;
  it("lists each cleared segment once, with its latest clear", () => {
    const list = clearedSegments([ev("e1", "AA", "d1", "T1", 1), ev("e2", "AB", "d2", "T2", 2), ev("e3", "AA", "d3", "T2", 3)]);
    expect(list).toEqual([
      { segmentId: "AA", eventId: "e3", deviceId: "d3", teamId: "T2" },
      { segmentId: "AB", eventId: "e2", deviceId: "d2", teamId: "T2" },
    ]);
  });
  it("names the clearing team when its own device wrote the debrief, else command", () => {
    const teams = [{ teamId: "T2", name: "Team 2" }];
    const cleared = { segmentId: "AA", eventId: "e3", deviceId: "d3", teamId: "T2" };
    expect(debriefAuthor({ byUid: "d3" }, cleared, teams)).toBe("Team 2");
    expect(debriefAuthor({ byUid: "cmd" }, cleared, teams)).toBe("Command");
    expect(debriefAuthor({ byUid: "d3" }, undefined, teams)).toBe("Command");
  });
});
