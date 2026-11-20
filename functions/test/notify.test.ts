// notifyPlanApproved: when command approves a plan, each team whose assignment changed gets one push on its own
// topic. The push names no person and no place; it says to open the app. Collapse key = incident, TTL 2 hours.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { changedTeams, handlePlanCreated, planMessage, teamTopic } from "../src/notify";
import { admin, clearFirestore, closeClients } from "./helpers";

const a = (teamId: string, segmentIds: string[], taskText = "Sweep it.") => ({ teamId, segmentIds, taskText, reason: "why" });
const NOW = Date.UTC(2026, 10, 22, 15, 0);

describe("which teams changed", () => {
  it("a new, changed or dropped assignment counts; an identical one does not", () => {
    const prev = [a("T1", ["AA"]), a("T2", ["AB"]), a("T3", ["AC"])];
    const next = [a("T1", ["AA"]), a("T2", ["AB", "AD"]), a("T4", ["AE"])];
    expect(changedTeams(prev, next)).toEqual(["T2", "T3", "T4"]);
    expect(changedTeams(prev, [a("T1", ["AA"], "Hasty search."), a("T2", ["AB"]), a("T3", ["AC"])])).toEqual(["T1"]);
    expect(changedTeams(null, next)).toEqual(["T1", "T2", "T4"]);
    expect(changedTeams(next, next)).toEqual([]);
  });
});

describe("the push", () => {
  it("goes to the team's topic, collapses per incident, lives 2 hours and carries no person or place", () => {
    const m = planMessage({ incidentId: "drill-dev-1", teamId: "T2", version: 4, drill: true, nowMs: NOW });
    expect(teamTopic("drill-dev-1", "T2")).toBe("pls-drill-dev-1-T2");
    // The whole message, exactly: an added key (a name, a place, the task text) fails here.
    expect(m).toEqual({ topic: "pls-drill-dev-1-T2", data: { incidentId: "drill-dev-1", teamId: "T2", planVersion: "4" },
      notification: { title: "Training drill: new assignment", body: "Your team has a new task. Open Point Last Seen to see it." },
      android: { collapseKey: "drill-dev-1", ttl: 7_200_000, priority: "high" },
      apns: { headers: { "apns-collapse-id": "drill-dev-1", "apns-expiration": String(Math.floor(NOW / 1000) + 7200) } } });
    expect(planMessage({ incidentId: "i", teamId: "T1", version: 1, drill: false, nowMs: NOW }).notification?.title).toBe("New assignment");
  });
});

describe("handlePlanCreated", () => {
  const sent: unknown[] = [];
  const messaging = { send: async (m: unknown) => { sent.push(m); return "id"; } };
  beforeEach(async () => {
    sent.length = 0;
    await clearFirestore();
    await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
    for (const t of ["T1", "T2"]) await admin.db.doc(`incidents/I1/teams/${t}`).set({ teamId: t, name: `Team ${t}` });
  });
  afterAll(closeClients);
  it("sends one push per changed team against the previous plan", async () => {
    await admin.db.doc("incidents/I1/plans/0001").set({ version: 1, assignments: [a("T1", ["AA"]), a("T2", ["AB"])] });
    await admin.db.doc("incidents/I1/plans/0002").set({ version: 2, assignments: [a("T1", ["AA"]), a("T2", ["AC"])] });
    expect(await handlePlanCreated(admin.db, messaging, "I1", "0002", NOW)).toEqual({ teams: ["T2"] });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ topic: "pls-I1-T2" });
  });
  it("the first plan notifies every team in it; a plan doc that is not a positive integer version sends nothing", async () => {
    await admin.db.doc("incidents/I1/plans/0001").set({ version: 1, assignments: [a("T1", ["AA"]), a("T2", ["AB"])] });
    expect((await handlePlanCreated(admin.db, messaging, "I1", "0001", NOW)).teams).toEqual(["T1", "T2"]);
    sent.length = 0;
    for (const id of ["draft", "0000", "-1"]) expect(await handlePlanCreated(admin.db, messaging, "I1", id, NOW)).toEqual({ teams: [] });
    expect(sent).toHaveLength(0);
  });
  it("pushes only to teams the incident has, with plain ids, at most 20 a plan, and never in a practice search (review)", async () => {
    await admin.db.doc("incidents/I1/teams/dev-1-T1").set({ teamId: "dev-1-T1" });
    await admin.db.doc("incidents/I1/plans/0001").set({ version: 1,
      assignments: [a("T2", ["AA"]), a("T9", ["AB"]), a("x/../y", ["AC"]), a("dev-1-T1", ["AD"])] });
    // "dev-1-T1" would build another incident's topic (pls-I1-dev-1-T1 = incident "I1-dev-1", team "T1"): refused.
    expect((await handlePlanCreated(admin.db, messaging, "I1", "0001", NOW)).teams).toEqual(["T2"]);
    sent.length = 0;
    const many = Array.from({ length: 30 }, (_, i) => `T${i + 10}`);
    for (const t of many) await admin.db.doc(`incidents/I1/teams/${t}`).set({ teamId: t });
    await admin.db.doc("incidents/I1/plans/0002").set({ version: 2, assignments: many.map(t => a(t, ["AA"])) });
    expect((await handlePlanCreated(admin.db, messaging, "I1", "0002", NOW)).teams).toHaveLength(20);
    expect(sent).toHaveLength(20);
    sent.length = 0;
    await admin.db.doc("incidents/judge-u1").set({ name: "Practice search", mode: "judge", status: "open" });
    await admin.db.doc("incidents/judge-u1/teams/T1").set({ teamId: "T1" });
    await admin.db.doc("incidents/judge-u1/plans/0001").set({ version: 1, assignments: [a("T1", ["AA"])] });
    expect(await handlePlanCreated(admin.db, messaging, "judge-u1", "0001", NOW)).toEqual({ teams: [] });
    expect(sent).toHaveLength(0);
  });
  it("a redelivered plan event sends nothing more: each team's notice for a plan version is claimed once (review)", async () => {
    await admin.db.doc("incidents/I1/plans/0001").set({ version: 1, assignments: [a("T1", ["AA"]), a("T2", ["AB"])] });
    expect((await handlePlanCreated(admin.db, messaging, "I1", "0001", NOW)).teams).toEqual(["T1", "T2"]);
    expect(await handlePlanCreated(admin.db, messaging, "I1", "0001", NOW + 1000)).toEqual({ teams: [] });
    expect(sent).toHaveLength(2);
  });
  it("a plan that a newer plan has already replaced announces nothing (review)", async () => {
    await admin.db.doc("incidents/I1/plans/0001").set({ version: 1, assignments: [a("T1", ["AA"])] });
    await admin.db.doc("incidents/I1/plans/0002").set({ version: 2, assignments: [a("T1", ["AB"])] });
    expect(await handlePlanCreated(admin.db, messaging, "I1", "0001", NOW)).toEqual({ teams: [] });
    expect(sent).toHaveLength(0);
    expect((await handlePlanCreated(admin.db, messaging, "I1", "0002", NOW)).teams).toEqual(["T1"]);
  });
  it("a send that fails gives its claim back, so a redelivery sends it (review)", async () => {
    await admin.db.doc("incidents/I1/plans/0001").set({ version: 1, assignments: [a("T1", ["AA"]), a("T2", ["AB"])] });
    const failing = { send: async () => { throw new Error("FCM unavailable"); } };
    await expect(handlePlanCreated(admin.db, failing, "I1", "0001", NOW)).rejects.toThrow("FCM unavailable");
    expect((await handlePlanCreated(admin.db, messaging, "I1", "0001", NOW + 1000)).teams).toEqual(["T1", "T2"]);
    expect(sent).toHaveLength(2);
  });
  it("is registered on plan creation", async () => {
    const { notifyPlanApproved } = await import("../src/index");
    const ep = (notifyPlanApproved as unknown as { __endpoint: { eventTrigger?: { eventType: string; eventFilters?: unknown } } }).__endpoint;
    expect(ep.eventTrigger?.eventType).toBe("google.cloud.firestore.document.v1.created");
  });
});
