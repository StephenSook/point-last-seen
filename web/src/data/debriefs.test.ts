import { deleteField, serverTimestamp, Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { clearedSegments, debriefAuthor, debriefEdit, debriefFromDoc, newDebriefDoc, parseDebriefForm, standingClears } from "./debriefs";
import { REPLACEMENT, removePhoneNumbers } from "./phoneNumbers";

const form = (over: Partial<Record<"minutes" | "worked" | "didNotWork" | "coverage" | "clues" | "hazards", string>>) => ({
  minutes: "", worked: "", didNotWork: "", coverage: "", clues: "", hazards: "", ...over,
});

describe("parseDebriefForm", () => {
  it("keeps the sighting times in a note a paper read already scrubbed, when it is saved", () => {
    // The paper read replaces the number and keeps the times; the save scrubs the note again and must take nothing more.
    const read = removePhoneNumbers("Witness 4045550142 at 14:03 14:10");
    expect(read).toBe("Witness [number removed] at 14:03 14:10");
    expect(parseDebriefForm(form({ minutes: "30", clues: read }))).toEqual({ ok: true, value: { tookMinutes: 30, clues: read } });
  });
  it("removes a phone number from every note before it can be stored, and leaves a note with none unchanged", () => {
    const r = parseDebriefForm(form({ minutes: "45", worked: "Radio 404-555-0142 worked", didNotWork: "Thick brush", clues: "Call 404 555 0142 at the gate", hazards: "Ranger at (404) 555 0142" }));
    expect(r).toEqual({
      ok: true,
      value: { tookMinutes: 45, worked: `Radio ${REPLACEMENT} worked`, didNotWork: "Thick brush", clues: `Call ${REPLACEMENT} at the gate`, hazards: `Ranger at ${REPLACEMENT}` },
    });
    expect(JSON.stringify(r)).not.toMatch(/0142/);
  });
  it("refuses a note that fits as typed but not once its number is replaced, and says so", () => {
    const worked = `${"x".repeat(486)} 404-555-0142`;
    expect(worked.length).toBe(499);
    expect(parseDebriefForm(form({ minutes: "5", worked }))).toEqual({ ok: false, message: "What worked: 500 characters at most once phone numbers are replaced." });
  });
  it("takes whole minutes from 0 to 1440 and optional notes, trimmed", () => {
    expect(parseDebriefForm(form({ minutes: " 45 ", worked: " Grid lines " }))).toEqual({ ok: true, value: { tookMinutes: 45, worked: "Grid lines" } });
    expect(parseDebriefForm(form({ minutes: "0", didNotWork: "Radio dead zone" }))).toEqual({ ok: true, value: { tookMinutes: 0, didNotWork: "Radio dead zone" } });
  });
  it("takes the team's stated coverage as a whole percent from 0 to 100, and clues and hazards, all optional", () => {
    expect(parseDebriefForm(form({ minutes: "45", coverage: " 75 ", clues: " Blue scarf on marker 4 ", hazards: "Loose rock" }))).toEqual({
      ok: true,
      value: { tookMinutes: 45, coverageStatedPct: 75, clues: "Blue scarf on marker 4", hazards: "Loose rock" },
    });
    expect(parseDebriefForm(form({ minutes: "45", coverage: "0" }))).toEqual({ ok: true, value: { tookMinutes: 45, coverageStatedPct: 0 } });
  });
  it("refuses a stated coverage that is not a whole percent from 0 to 100, and clues or hazards over 500 characters", () => {
    for (const coverage of ["101", "-1", "75.5", "most", "75%"]) {
      expect(parseDebriefForm(form({ minutes: "5", coverage })), coverage).toEqual({ ok: false, message: "Coverage stated: a whole number from 0 to 100, or empty." });
    }
    expect(parseDebriefForm(form({ minutes: "5", clues: "x".repeat(501) }))).toEqual({ ok: false, message: "Clues: 500 characters at most." });
    expect(parseDebriefForm(form({ minutes: "5", hazards: "x".repeat(501) }))).toEqual({ ok: false, message: "Hazards: 500 characters at most." });
  });
  it("refuses minutes that are not a whole number in range, and notes over 500 characters", () => {
    for (const minutes of ["", "1441", "-1", "2.5", "abc"]) {
      expect(parseDebriefForm(form({ minutes }))).toEqual({ ok: false, message: "Time it took: a whole number of minutes, 0 to 1440." });
    }
    expect(parseDebriefForm(form({ minutes: "5", worked: "x".repeat(501) }))).toEqual({ ok: false, message: "What worked: 500 characters at most." });
    expect(parseDebriefForm(form({ minutes: "5", didNotWork: "x".repeat(501) }))).toEqual({ ok: false, message: "What didn't work: 500 characters at most." });
  });
});

describe("debriefFromDoc", () => {
  it("reads a stored debrief", () => {
    expect(debriefFromDoc("AA", { tookMinutes: 30, worked: "Line search", byUid: "u1", createdAt: Timestamp.fromMillis(5), clearedEventId: null })).toEqual({
      segmentId: "AA", tookMinutes: 30, worked: "Line search", didNotWork: undefined, coverageStatedPct: undefined, clues: undefined, hazards: undefined,
      byUid: "u1", createdAtMs: 5, clearedEventId: null,
    });
  });
  it("reads the stated coverage, clues and hazards, and drops a stated coverage it cannot trust", () => {
    const d = debriefFromDoc("AA", { tookMinutes: 30, coverageStatedPct: 75, clues: "Scarf", hazards: "Rock", byUid: "u1", createdAt: null });
    expect([d?.coverageStatedPct, d?.clues, d?.hazards]).toEqual([75, "Scarf", "Rock"]);
    expect(debriefFromDoc("AA", { tookMinutes: 30, coverageStatedPct: 101, byUid: "u1" })?.coverageStatedPct).toBeUndefined();
    expect(debriefFromDoc("AA", { tookMinutes: 30, coverageStatedPct: "75", byUid: "u1" })?.coverageStatedPct).toBeUndefined();
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
    expect(Object.keys(e).sort()).toEqual(["clues", "coverageStatedPct", "didNotWork", "hazards", "tookMinutes", "worked"]);
    for (const k of ["didNotWork", "coverageStatedPct", "clues", "hazards"]) expect((e[k] as ReturnType<typeof deleteField>).isEqual(deleteField()), k).toBe(true);
  });
  it("a new debrief and an edit carry the stated coverage, clues and hazards when given", () => {
    const input = { tookMinutes: 45, coverageStatedPct: 75, clues: "Scarf", hazards: "Rock" };
    expect(newDebriefDoc(input, "u1", null)).toMatchObject(input);
    expect(debriefEdit(input)).toMatchObject(input);
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
  it("counts a segment as cleared for a search report only while one of its clears is not taken back", () => {
    const retract = (eventId: string, target: string) => ({ eventId, type: "retraction", targetEventId: target, serverTimeMs: 9, pendingWrite: false, effect: { kind: "none" } }) as never;
    const events = [ev("e1", "AA", "d1", "T1", 1), ev("e2", "AB", "d2", "T2", 2), ev("e3", "AB", "d3", "T2", 3), ev("e4", "AC", "d4", "T1", 4)];
    expect([...standingClears(events)].sort()).toEqual(["AA", "AB", "AC"]);
    // AA's only clear is taken back; AB keeps its earlier clear after the later one is taken back.
    expect([...standingClears([...events, retract("r1", "e1"), retract("r2", "e3")])].sort()).toEqual(["AB", "AC"]);
    expect([...standingClears([...events, retract("r1", "e1"), retract("r2", "e3"), retract("r3", "e2")])].sort()).toEqual(["AC"]);
  });
  it("links a segment's debrief to its latest clear that command has not taken back", () => {
    const retract = (eventId: string, target: string) => ({ eventId, type: "retraction", targetEventId: target, serverTimeMs: 9, pendingWrite: false, effect: { kind: "none" } }) as never;
    const events = [ev("e1", "AB", "d1", "T1", 1), ev("e2", "AB", "d2", "T2", 2), ev("e3", "AC", "d3", "T1", 3)];
    expect(clearedSegments([...events, retract("r1", "e2")])).toEqual([
      { segmentId: "AB", eventId: "e1", deviceId: "d1", teamId: "T1" },
      { segmentId: "AC", eventId: "e3", deviceId: "d3", teamId: "T1" },
    ]);
    expect(clearedSegments([...events, retract("r1", "e2"), retract("r2", "e1")]).map((c) => c.segmentId)).toEqual(["AC"]);
  });
  it("names the clearing team when its own device wrote the debrief, else command", () => {
    const teams = [{ teamId: "T2", name: "Team 2" }];
    const cleared = { segmentId: "AA", eventId: "e3", deviceId: "d3", teamId: "T2" };
    expect(debriefAuthor({ byUid: "d3" }, cleared, teams)).toBe("Team 2");
    expect(debriefAuthor({ byUid: "cmd" }, cleared, teams)).toBe("Command");
    expect(debriefAuthor({ byUid: "d3" }, undefined, teams)).toBe("Command");
  });
});
