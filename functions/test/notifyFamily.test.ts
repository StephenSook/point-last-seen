// The family channel's pushes: a question from command, or the search moving to searching or paused. Each goes to
// the incident's family topic with ids only; the text stays in Firestore. Never an outcome; capped per incident per
// day; never in a judge practice search.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FAMILY_PUSHES_PER_DAY, familyMessage, familyTopic, handleFamilyQuestion, handlePlanCreated, handleSearchState } from "../src/notify";
import { admin, clearFirestore, closeClients } from "./helpers";

const NOW = Date.UTC(2026, 10, 21, 15, 0);
const sent: Record<string, unknown>[] = [];
const messaging = { send: async (m: unknown) => { sent.push(m as Record<string, unknown>); return "id"; } };

beforeEach(async () => {
  sent.length = 0;
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("the family push", () => {
  it("goes to the incident's family topic with ids only and fixed wording, never the question's text", () => {
    expect(familyTopic("drill-dev-1")).toBe("pls-drill-dev-1-family");
    const q = familyMessage({ incidentId: "drill-dev-1", kind: "question", questionId: "q1", drill: true, nowMs: NOW });
    expect(q).toMatchObject({ topic: "pls-drill-dev-1-family", data: { kind: "question", incidentId: "drill-dev-1", questionId: "q1" },
      notification: { title: "Training drill", body: "The search lead has a question." },
      android: { collapseKey: "drill-dev-1-family", ttl: 7_200_000 } });
    expect(familyMessage({ incidentId: "i", kind: "searching", drill: true, nowMs: NOW }).notification?.body).toBe("Teams are searching now.");
    expect(familyMessage({ incidentId: "i", kind: "searching", drill: false, nowMs: NOW }).notification?.title).toBe("Point Last Seen");
    expect(familyMessage({ incidentId: "i", kind: "paused", drill: true, nowMs: NOW }).notification?.body).toBe("The search is paused. The search lead will call you.");
    expect(familyMessage({ incidentId: "i", kind: "paused", drill: true, nowMs: NOW }).data).toEqual({ kind: "paused", incidentId: "i" });
  });
});

describe("handleFamilyQuestion and handleSearchState", () => {
  it("a new question sends one push", async () => {
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", "q1", NOW)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).not.toContain("song");
  });
  it("only a change to searching or paused sends; nothing else about the incident does", async () => {
    expect(await handleSearchState(admin.db, messaging, "I1", { searchState: "searching" }, { searchState: "paused" }, NOW)).toBe(true);
    expect(await handleSearchState(admin.db, messaging, "I1", { searchState: "paused" }, { searchState: "paused" }, NOW)).toBe(false);
    expect(await handleSearchState(admin.db, messaging, "I1", { status: "open" }, { status: "found" }, NOW)).toBe(false);
    expect(await handleSearchState(admin.db, messaging, "I1", { searchState: "paused" }, { searchState: "found" }, NOW)).toBe(false);
    expect(sent.map(m => (m.data as { kind: string }).kind)).toEqual(["paused"]);
  });
  it("at most the daily cap per incident, counting both kinds; a new day starts again", async () => {
    for (let i = 0; i < FAMILY_PUSHES_PER_DAY; i++) await handleFamilyQuestion(admin.db, messaging, "I1", `q${i}`, NOW);
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", "late", NOW)).toBe(false);
    expect(await handleSearchState(admin.db, messaging, "I1", {}, { searchState: "paused" }, NOW)).toBe(false);
    expect(sent).toHaveLength(FAMILY_PUSHES_PER_DAY);
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", "next-day", NOW + 86_400_000)).toBe(true);
  });
  it("a team named family never gets a plan push, since its topic is the family's", async () => {
    for (const t of ["family", "T1"]) await admin.db.doc(`incidents/I1/teams/${t}`).set({ name: t });
    const a = (teamId: string, seg: string) => ({ teamId, segmentIds: [seg], taskText: `Search segment ${seg}.`, reason: "r" });
    await admin.db.doc("incidents/I1/plans/0001").set({ version: 1, assignments: [a("family", "AA"), a("T1", "AB")] });
    expect((await handlePlanCreated(admin.db, messaging, "I1", "0001", NOW)).teams).toEqual(["T1"]);
    expect(sent.map(m => m.topic)).toEqual(["pls-I1-T1"]);
  });
  it("never in a judge practice search", async () => {
    await admin.db.doc("incidents/judge-u1").set({ name: "Practice search", mode: "judge", status: "open" });
    expect(await handleFamilyQuestion(admin.db, messaging, "judge-u1", "q1", NOW)).toBe(false);
    expect(await handleSearchState(admin.db, messaging, "judge-u1", {}, { searchState: "paused" }, NOW)).toBe(false);
    expect(sent).toHaveLength(0);
  });
  it("is registered on question creation and on incident updates", async () => {
    const { notifyFamilyQuestion, notifyFamilySearchState } = await import("../src/index");
    const type = (f: unknown) => (f as { __endpoint: { eventTrigger?: { eventType: string } } }).__endpoint.eventTrigger?.eventType;
    expect(type(notifyFamilyQuestion)).toBe("google.cloud.firestore.document.v1.created");
    expect(type(notifyFamilySearchState)).toBe("google.cloud.firestore.document.v1.updated");
  });
});
