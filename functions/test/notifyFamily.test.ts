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
    const q = familyMessage({ incidentId: "drill-dev-1", kind: "question", questionId: "Ab3dEf6hIj9kLm2nOp5q", drill: true, nowMs: NOW });
    // The whole message, exactly: an added key (the question's text, a name) fails here.
    expect(q).toEqual({ topic: "pls-drill-dev-1-family", data: { kind: "question", incidentId: "drill-dev-1", questionId: "Ab3dEf6hIj9kLm2nOp5q" },
      notification: { title: "Training drill", body: "The search lead has a question." },
      android: { collapseKey: "drill-dev-1-family", ttl: 7_200_000, priority: "high" },
      apns: { headers: { "apns-collapse-id": "drill-dev-1-family", "apns-expiration": String(Math.floor(NOW / 1000) + 7200) } } });
    expect(familyMessage({ incidentId: "i", kind: "searching", drill: true, nowMs: NOW }).notification?.body).toBe("Teams are searching now.");
    expect(familyMessage({ incidentId: "i", kind: "searching", drill: false, nowMs: NOW }).notification?.title).toBe("Point Last Seen");
    expect(familyMessage({ incidentId: "i", kind: "paused", drill: true, nowMs: NOW }).notification?.body).toBe("The search is paused. The search lead will call you.");
    expect(familyMessage({ incidentId: "i", kind: "paused", drill: true, nowMs: NOW }).data).toEqual({ kind: "paused", incidentId: "i" });
  });
});

describe("handleFamilyQuestion and handleSearchState", () => {
  // Firestore auto-ids (addDoc), as the rules require; event ids as the trigger delivers them.
  const QID = "Ab3dEf6hIj9kLm2nOp5q";
  const qid = (i: number) => `Qq${String(i).padStart(18, "0")}`;
  let n = 0;
  const ev = () => `projects/p/events/${++n}`;
  const TEXT = "Does Mrs Example like the bandstand by the lake?";
  const ask = (id = QID, inc = "I1") =>
    admin.db.doc(`incidents/${inc}/familyQuestions/${id}`).set({ text: TEXT, createdByUid: "c", createdAt: new Date(NOW) });
  // The incident moves to a state, and the trigger then fires for that change.
  const moveTo = async (v: string, before: string | undefined, inc = "I1", eventId = ev()) => {
    await admin.db.doc(`incidents/${inc}`).update({ searchState: v });
    return handleSearchState(admin.db, messaging, inc, before === undefined ? {} : { searchState: before }, { searchState: v }, eventId, NOW);
  };
  const exp = String(Math.floor(NOW / 1000) + 7200);
  const shell = { topic: "pls-I1-family", android: { collapseKey: "I1-family", ttl: 7_200_000, priority: "high" },
    apns: { headers: { "apns-collapse-id": "I1-family", "apns-expiration": exp } } };

  it("sends each kind exactly, with ids only: never the stored question's text", async () => {
    await ask();
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", QID, ev(), NOW)).toBe(true);
    expect(await moveTo("paused", undefined)).toBe(true);
    expect(await moveTo("searching", "paused")).toBe(true);
    expect(sent).toEqual([
      { ...shell, data: { kind: "question", incidentId: "I1", questionId: QID }, notification: { title: "Training drill", body: "The search lead has a question." } },
      { ...shell, data: { kind: "paused", incidentId: "I1" }, notification: { title: "Training drill", body: "The search is paused. The search lead will call you." } },
      { ...shell, data: { kind: "searching", incidentId: "I1" }, notification: { title: "Training drill", body: "Teams are searching now." } },
    ]);
    expect(JSON.stringify(sent)).not.toContain("bandstand");
  });
  it("sends once per event: a redelivered trigger event sends nothing more and uses no more budget", async () => {
    await ask();
    const e = ev();
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", QID, e, NOW)).toBe(true);
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", QID, e, NOW)).toBe(false);
    expect(sent).toHaveLength(1);
    expect((await admin.db.doc("incidents/I1/pushBudget/family-2026-11-21").get()).get("count")).toBe(1);
  });
  it("only a change to searching or paused sends, and only while the incident still holds that state", async () => {
    expect(await moveTo("paused", "searching")).toBe(true);
    expect(await moveTo("paused", "paused")).toBe(false);
    expect(await handleSearchState(admin.db, messaging, "I1", { status: "open" }, { status: "found" }, ev(), NOW)).toBe(false);
    expect(await handleSearchState(admin.db, messaging, "I1", { searchState: "paused" }, { searchState: "found" }, ev(), NOW)).toBe(false);
    // A late event for "searching" after the incident already moved back to paused is stale: no push.
    expect(await handleSearchState(admin.db, messaging, "I1", { searchState: "paused" }, { searchState: "searching" }, ev(), NOW)).toBe(false);
    expect(sent.map(m => (m.data as { kind: string }).kind)).toEqual(["paused"]);
  });
  it("at most 20 a day per incident, counting both kinds; a new day starts again", async () => {
    expect(FAMILY_PUSHES_PER_DAY).toBe(20);
    for (let i = 0; i < 20; i++) {
      await ask(qid(i));
      expect(await handleFamilyQuestion(admin.db, messaging, "I1", qid(i), ev(), NOW)).toBe(true);
    }
    await ask(qid(20));
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", qid(20), ev(), NOW)).toBe(false);
    expect(await moveTo("paused", undefined)).toBe(false);
    expect(sent).toHaveLength(20);
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", qid(20), ev(), NOW + 86_400_000)).toBe(true);
  });
  it("refuses ids that could carry text or break the topic, before any budget is used", async () => {
    for (const id of ["q1", "Mrs_Jones_phone_5551", "Ab3d-f6hIj9kLm2nOp5q"]) {
      expect(await handleFamilyQuestion(admin.db, messaging, "I1", id, ev(), NOW)).toBe(false);
    }
    for (const inc of ["I 1", "I1/x", "x".repeat(129), ""]) {
      expect(await handleFamilyQuestion(admin.db, messaging, inc, QID, ev(), NOW)).toBe(false);
    }
    expect(sent).toHaveLength(0);
    expect((await admin.db.collection("incidents/I1/pushBudget").get()).size).toBe(0);
  });
  it("sends no question push for an incident that is no longer open", async () => {
    await ask();
    await admin.db.doc("incidents/I1").update({ status: "found" });
    expect(await handleFamilyQuestion(admin.db, messaging, "I1", QID, ev(), NOW)).toBe(false);
    expect(sent).toHaveLength(0);
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
    await ask(QID, "judge-u1");
    expect(await handleFamilyQuestion(admin.db, messaging, "judge-u1", QID, ev(), NOW)).toBe(false);
    expect(await moveTo("paused", undefined, "judge-u1")).toBe(false);
    expect(sent).toHaveLength(0);
  });
  it("is registered on question creation and on incident updates", async () => {
    const { notifyFamilyQuestion, notifyFamilySearchState } = await import("../src/index");
    const type = (f: unknown) => (f as { __endpoint: { eventTrigger?: { eventType: string } } }).__endpoint.eventTrigger?.eventType;
    expect(type(notifyFamilyQuestion)).toBe("google.cloud.firestore.document.v1.created");
    expect(type(notifyFamilySearchState)).toBe("google.cloud.firestore.document.v1.updated");
  });
});
