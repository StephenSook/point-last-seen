import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleRotateJoinCode } from "../src/codes";
import { handleJoin } from "../src/join";
import { admin, clearFirestore, closeClients } from "./helpers";

const hash = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");
const SEARCHER = "SRCH2345", FAMILY = "FAMY2345", REVIEWER = "RVWR2345", OTHER = "QTHR2345";

async function account(claims: { inc: string; role: string; team: string | null }): Promise<string> {
  const u = await admin.auth.createUser({});
  await admin.auth.setCustomUserClaims(u.uid, claims);
  return u.uid;
}
async function joinErr(uid: string, joinCode: string, role: string, teamId?: string): Promise<string | null> {
  return handleJoin(uid, { joinCode, role, ...(teamId ? { teamId } : {}) } as never).then(() => null, (e: unknown) => (e as { code?: string }).code ?? "error");
}
async function expectCode(p: Promise<unknown>, code: string, reason?: string): Promise<void> {
  const err = await p.then(() => null, (e: unknown) => e as { code?: string; details?: { reason?: string } });
  expect(err, "expected a rejection").not.toBeNull();
  expect(err?.code).toBe(code);
  if (reason) expect(err?.details?.reason).toBe(reason);
}

let cmd = "";
const asCmd = () => ({ uid: cmd, token: { inc: "I1", role: "command" } });
beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I1/teams/T1").set({ teamId: "T1", name: "Team 1", colorSlot: 1 });
  await admin.db.doc("incidents/I2").set({ name: "Other drill", mode: "drill", status: "open" });
  await admin.db.doc(`joinCodes/${hash(SEARCHER)}`).set({ incidentId: "I1", roles: ["searcher"] });
  await admin.db.doc(`joinCodes/${hash(REVIEWER)}`).set({ incidentId: "I1", roles: ["searcher"] });
  await admin.db.doc(`joinCodes/${hash(FAMILY)}`).set({ incidentId: "I1", roles: ["family"] });
  await admin.db.doc(`joinCodes/${hash(OTHER)}`).set({ incidentId: "I2", roles: ["searcher"] });
  cmd = await account({ inc: "I1", role: "command", team: null });
});
afterAll(closeClients);

describe("rotateJoinCode: command gives a role a new join code", () => {
  it("returns a new code in the join format; it admits that role, and every old code of the role stops working", async () => {
    const res = await handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "searcher" });
    expect(res.role).toBe("searcher");
    expect(res.replaced).toBe(2);
    expect(res.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect([SEARCHER, REVIEWER]).not.toContain(res.code);
    const fresh = (await admin.auth.createUser({})).uid;
    expect(await joinErr(fresh, SEARCHER, "searcher", "T1")).toBe("permission-denied");
    expect(await joinErr(fresh, REVIEWER, "searcher", "T1")).toBe("permission-denied");
    expect(await joinErr(fresh, res.code, "searcher", "T1")).toBeNull();
  });

  it("leaves the other role's code and other incidents' codes alone", async () => {
    await handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "searcher" });
    expect(await joinErr((await admin.auth.createUser({})).uid, FAMILY, "family")).toBeNull();
    expect((await admin.db.doc(`joinCodes/${hash(OTHER)}`).get()).exists).toBe(true);
  });

  it("records the new code like a seeded one: its incident, its one role, when, and which command made it", async () => {
    const res = await handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "family" });
    const d = await admin.db.doc(`joinCodes/${hash(res.code)}`).get();
    expect(d.get("incidentId")).toBe("I1");
    expect(d.get("roles")).toEqual(["family"]);
    expect(d.get("createdAt")).toBeTruthy();
    expect(d.get("rotatedBy")).toBe(cmd);
    expect((await admin.db.doc(`joinCodes/${hash(FAMILY)}`).get()).exists).toBe(false);
  });

  it("a person command removed cannot come back with a new sign-in and the old code", async () => {
    const removed = await account({ inc: "I1", role: "searcher", team: "T1" });
    await admin.db.doc(`incidents/I1/removed/${removed}`).set({ removedAt: new Date(), removedBy: cmd, role: "searcher" });
    await handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "searcher" });
    expect(await joinErr((await admin.auth.createUser({})).uid, SEARCHER, "searcher", "T1")).toBe("permission-denied");
  });
});

describe("refusals", () => {
  it("refuses anyone who is not this incident's command now", async () => {
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, null, { incidentId: "I1", role: "searcher" }), "unauthenticated");
    const s = await account({ inc: "I1", role: "searcher", team: "T1" });
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, { uid: s, token: { inc: "I1", role: "searcher" } }, { incidentId: "I1", role: "searcher" }), "permission-denied", "not_command");
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, { uid: s, token: { inc: "I1", role: "command" } }, { incidentId: "I1", role: "searcher" }), "permission-denied", "not_command");
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, { uid: cmd, token: { inc: "I2", role: "command" } }, { incidentId: "I2", role: "searcher" }), "permission-denied", "not_command");
    await admin.db.doc(`incidents/I1/removed/${cmd}`).set({ removedAt: new Date(), removedBy: "x", role: "command" });
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "searcher" }), "permission-denied", "not_command");
    expect((await admin.db.doc(`joinCodes/${hash(SEARCHER)}`).get()).exists).toBe(true);
  });

  it("refuses a command code, an unknown role and malformed input", async () => {
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "command" }), "invalid-argument", "bad_role");
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "boss" }), "invalid-argument", "bad_role");
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I 1", role: "searcher" }), "invalid-argument", "bad_incident_id");
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), null), "invalid-argument");
  });

  it("refuses a closed search, a practice sandbox, and a missing or expired incident, and changes no code", async () => {
    await admin.db.doc("incidents/I1").update({ status: "closed" });
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "searcher" }), "failed-precondition", "not_open");
    await admin.db.doc("incidents/I1").update({ status: "open", mode: "judge", setupReady: true, expiresAt: new Date(Date.now() + 3600_000) });
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "searcher" }), "failed-precondition", "practice_search");
    await admin.db.doc("incidents/I1").update({ mode: "drill", expiresAt: new Date(Date.now() - 1000) });
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, asCmd(), { incidentId: "I1", role: "searcher" }), "permission-denied", "not_command");
    expect((await admin.db.doc(`joinCodes/${hash(SEARCHER)}`).get()).exists).toBe(true);
    const ghost = await account({ inc: "GONE", role: "command", team: null });
    await expectCode(handleRotateJoinCode(admin.db, admin.auth, { uid: ghost, token: { inc: "GONE", role: "command" } }, { incidentId: "GONE", role: "searcher" }), "permission-denied", "not_command");
  });
});
