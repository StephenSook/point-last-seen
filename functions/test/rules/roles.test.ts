import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { validEvent, validPlan } from "../fixtures";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const S = "searcher-uid", C = "command-uid", F = "family-uid";

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I1/segments/AC").set({ segmentId: "AC", priorPoa: 0.1 });
  await admin.db.doc("incidents/I1/packs/T1").set({ packVersion: 1 });
  await admin.db.doc("incidents/I1/planDrafts/h1").set({ eventSetHash: "h1" });
});
afterAll(closeClients);

describe("incident, segments, teams", () => {
  it("a non-member cannot read", async () => {
    await assertFails(getDoc(doc(dbAs("x", {}), "incidents/I1")));
    await assertFails(getDoc(doc(dbAs("y", { inc: "I2", role: "command", team: null }), "incidents/I1")));
    await assertFails(getDoc(doc(dbAs(null), "incidents/I1/segments/AC")));
  });
  it("members read the incident, segments and packs; nothing reads plan drafts, which nothing writes", async () => {
    const db = dbAs(S, searcherClaims);
    await assertSucceeds(getDoc(doc(db, "incidents/I1")));
    await assertSucceeds(getDoc(doc(db, "incidents/I1/segments/AC")));
    await assertSucceeds(getDoc(doc(db, "incidents/I1/packs/T1")));
    await assertFails(getDoc(doc(db, "incidents/I1/planDrafts/h1")));
    await assertFails(getDoc(doc(dbAs(C, commandClaims), "incidents/I1/planDrafts/h1")));
  });
  it("only command writes the incident doc and segments; teams come only from admin tools", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), "incidents/I1/segments/AD"), { segmentId: "AD" }));
    await assertFails(setDoc(doc(dbAs(F, familyClaims), "incidents/I1/teams/T2"), { teamId: "T2" }));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), "incidents/I1"), { name: "x", mode: "drill", status: "open" }));
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/segments/AD"), { segmentId: "AD" }));
    // A plan holds at most 10 teams, and only the seed tool (at most 10) and the practice copy make teams.
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/teams/T2"), { teamId: "T2", name: "Team 2", colorSlot: 2 }));
    await admin.db.doc("incidents/I1/teams/T1").set({ teamId: "T1", name: "Team 1", colorSlot: 1 });
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/teams/T1"), { name: "Renamed" }, { merge: true }));
    await assertFails(deleteDoc(doc(dbAs(C, commandClaims), "incidents/I1/teams/T1")));
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { name: "Drill", mode: "drill", status: "open" }, { merge: true }));
  });
  it("command cannot switch the incident out of drill or judge mode", async () => {
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { mode: "live" }, { merge: true }));
  });
});

describe("incident lifecycle: claims outlive an incident, so the rules check it", () => {
  const J = { inc: "J1", role: "command", team: null };
  const JS = { inc: "J1", role: "searcher", team: "T1" };
  const ev = (uid: string, over: Record<string, unknown> = {}) => validEvent(uid, { incidentId: "J1", ...over });
  const at = (inc: string, e: Record<string, unknown>) => `incidents/${inc}/events/${e.eventId as string}`;
  it("an expired judge sandbox locks every member out of reads and writes", async () => {
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() - 60_000),
      setupReady: true });
    const seeded = ev(S, { seq: 1, serverTime: null });
    await admin.db.doc(at("J1", seeded)).set(seeded);
    await assertFails(getDoc(doc(dbAs(C, J), "incidents/J1")));
    await assertFails(getDoc(doc(dbAs(S, JS), at("J1", seeded))));
    const e2 = ev(S, { seq: 2 });
    await assertFails(setDoc(doc(dbAs(S, JS), at("J1", e2)), e2));
  });
  it("a judge sandbox before its expiry works as usual", async () => {
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3600_000),
      setupReady: true });
    await assertSucceeds(getDoc(doc(dbAs(C, J), "incidents/J1")));
    const e2 = ev(S, { seq: 2 });
    await assertSucceeds(setDoc(doc(dbAs(S, JS), at("J1", e2)), e2));
  });
  it("a judge sandbox still being set up, or with no setup flag, locks its members out, even with live claims; a ready one does not", async () => {
    // Review: a returning judge keeps claims for judge-{uid}, so access must wait for the copy to finish.
    const live = { name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3600_000) };
    await admin.db.doc("incidents/J1").set({ ...live, setupReady: false, setupId: "s1", setupStartedAtMs: 1 });
    await admin.db.doc("incidents/J1/segments/AA").set({ segmentId: "AA", priorPoa: 0.1 });
    await assertFails(getDoc(doc(dbAs(C, J), "incidents/J1")));
    await assertFails(getDoc(doc(dbAs(C, J), "incidents/J1/segments/AA")));
    const e2 = ev(S, { seq: 2 });
    await assertFails(setDoc(doc(dbAs(S, JS), at("J1", e2)), e2));
    await admin.db.doc("incidents/J1").update({ setupReady: true });
    await assertSucceeds(getDoc(doc(dbAs(C, J), "incidents/J1")));
    await assertSucceeds(getDoc(doc(dbAs(C, J), "incidents/J1/segments/AA")));
    // A sandbox with no flag at all (made before setup was tracked) is not counted as ready.
    await admin.db.doc("incidents/J1").set(live);
    await assertFails(getDoc(doc(dbAs(C, J), "incidents/J1")));
    await assertFails(getDoc(doc(dbAs(C, J), "incidents/J1/segments/AA")));
  });
  it("only the server sets a sandbox's setup state", async () => {
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3600_000), setupReady: true });
    const db = dbAs(C, J);
    for (const f of [{ setupReady: false }, { setupId: "mine" }, { setupStartedAtMs: 0 }]) {
      await assertFails(setDoc(doc(db, "incidents/J1"), f, { merge: true }));
    }
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { setupReady: true }, { merge: true }));
  });
  it("a closed incident stays readable to its members but takes no new events or plans", async () => {
    await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "closed" });
    await assertSucceeds(getDoc(doc(dbAs(S, searcherClaims), "incidents/I1")));
    const e3 = validEvent(S, { seq: 3 });
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/events/${e3.eventId as string}`), e3));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/plans/0009"), validPlan(C, 9)));
  });
  it("command cannot change mode or expiresAt, so a sandbox cannot be extended or a drill relabelled", async () => {
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3600_000),
      setupReady: true });
    const db = dbAs(C, J);
    await assertFails(setDoc(doc(db, "incidents/J1"), { expiresAt: null }, { merge: true }));
    await assertFails(setDoc(doc(db, "incidents/J1"), { expiresAt: new Date(Date.now() + 365 * 86400_000) }, { merge: true }));
    await assertFails(setDoc(doc(db, "incidents/J1"), { mode: "drill" }, { merge: true }));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { mode: "judge" }, { merge: true }));
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { name: "Renamed drill" }, { merge: true }));
  });
  it("closing is final: a closed incident cannot be reopened or edited by a client", async () => {
    await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "closed" });
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { status: "open" }, { merge: true }));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { name: "x" }, { merge: true }));
  });
  it("closedAt is the server's: command closes a drill but cannot write when, so retention cannot be moved", async () => {
    const db = dbAs(C, commandClaims);
    await assertFails(setDoc(doc(db, "incidents/I1"), { closedAt: new Date(Date.now() - 60 * 86400_000) }, { merge: true }));
    await assertFails(setDoc(doc(db, "incidents/I1"), { status: "closed", closedAt: new Date(Date.now() - 60 * 86400_000) }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, "incidents/I1"), { status: "closed" }, { merge: true }));
  });
  it("no client reads or writes a drill purge record", async () => {
    await admin.db.doc("ops/drillPurges/items/I1").set({ startedAt: new Date() });
    await assertFails(getDoc(doc(dbAs(C, commandClaims), "ops/drillPurges/items/I1")));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "ops/drillPurges/items/I1"), { startedAt: null }));
    await assertFails(getDoc(doc(dbAs(null), "ops/drillPurges/items/I1")));
  });
  it("no client creates an incident", async () => {
    await assertFails(setDoc(doc(dbAs(C, { inc: "I3", role: "command", team: null }), "incidents/I3"), { name: "New", mode: "drill", status: "open" }));
  });
  it("a judge sandbox without a timestamp expiry locks members out", async () => {
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open" });
    await assertFails(getDoc(doc(dbAs(C, J), "incidents/J1")));
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: "tomorrow" });
    await assertFails(getDoc(doc(dbAs(C, J), "incidents/J1")));
  });
  it("a member of an incident that does not exist reads nothing", async () => {
    await assertFails(getDoc(doc(dbAs("z", { inc: "GONE", role: "command", team: null }), "incidents/GONE/segments/AC")));
  });
});

describe("join codes", () => {
  it("no client reads or writes join codes", async () => {
    await admin.db.doc(`joinCodes/${"0".repeat(64)}`).set({ incidentId: "I1", roles: ["command"] });
    await assertFails(getDoc(doc(dbAs(C, commandClaims), `joinCodes/${"0".repeat(64)}`)));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), `joinCodes/${"1".repeat(64)}`), { incidentId: "I1", roles: ["command"] }));
  });
  it("the member-readable incident doc cannot carry join code hashes", async () => {
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { joinCodeHash: "x" }, { merge: true }));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1"), { commandJoinCodeHash: "x" }, { merge: true }));
  });
});

describe("pack records are per team", () => {
  it("a searcher reads its own team's pack record, not another team's; command reads all", async () => {
    await admin.db.doc("incidents/I1/packs/T2").set({ packVersion: 1 });
    await assertSucceeds(getDoc(doc(dbAs(S, searcherClaims), "incidents/I1/packs/T1")));
    await assertFails(getDoc(doc(dbAs(S, searcherClaims), "incidents/I1/packs/T2")));
    await assertSucceeds(getDoc(doc(dbAs(C, commandClaims), "incidents/I1/packs/T2")));
    await assertFails(getDoc(doc(dbAs(F, familyClaims), "incidents/I1/packs/T1")));
  });
});

describe("plans, plan drafts and packs", () => {
  it("only command creates plans; no client writes planDrafts or packs", async () => {
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/plans/0001"), validPlan(C)));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), "incidents/I1/plans/0002"), validPlan(S, 2)));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/planDrafts/abc"), {}));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/packs/T1"), { packVersion: 2 }));
  });
  it("a plan is approved by the signed-in command user and never changed", async () => {
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/plans/0003"), validPlan("someone-else", 3)));
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/plans/0004"), validPlan(C, 4)));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/plans/0004"), validPlan(C, 4)));
  });
});

describe("devices and measurements", () => {
  it("a device writes only its own device doc and measurements (device id is its auth uid)", async () => {
    const db = dbAs(S, searcherClaims);
    await assertSucceeds(setDoc(doc(db, `incidents/I1/teams/T1/devices/${S}`), { packVersion: 1, appVersion: "1.0" }));
    await assertSucceeds(setDoc(doc(db, `incidents/I1/teams/T1/devices/${S}/measurements/${"a".repeat(32)}`),
      { submittedAtMs: 1, readDoneAtMs: 2, redrawnAtMs: 3 }));
    await assertFails(setDoc(doc(db, "incidents/I1/teams/T1/devices/another-uid"), { packVersion: 1 }));
    await assertFails(setDoc(doc(db, `incidents/I1/teams/T1/devices/another-uid/measurements/${"a".repeat(32)}`), { submittedAtMs: 1 }));
  });
  it("a searcher writes device docs only under its own team", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/teams/T2/devices/${S}`), { packVersion: 1 }));
  });
});

describe("a judge's practice incident (startJudgeSession)", () => {
  it("a judge reads and writes only their own sandbox, never another incident", async () => {
    const J = "judge-uid", claims = { inc: `judge-${J}`, role: "command", team: null };
    await admin.db.doc(`incidents/judge-${J}`).set({ name: "Practice search", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3_600_000),
      setupReady: true });
    await admin.db.doc(`incidents/judge-${J}/segments/AC`).set({ segmentId: "AC", priorPoa: 0.1 });
    await assertSucceeds(getDoc(doc(dbAs(J, claims), `incidents/judge-${J}/segments/AC`)));
    await assertFails(getDoc(doc(dbAs(J, claims), "incidents/I1")));
    await assertFails(getDoc(doc(dbAs(J, claims), "incidents/I1/segments/AC")));
    await assertFails(setDoc(doc(dbAs(J, claims), `incidents/I1/events/${validEvent(J).eventId as string}`), validEvent(J)));
  });
});
