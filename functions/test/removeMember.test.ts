import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleJoin } from "../src/join";
import { handleRemoveMember } from "../src/members";
import { admin, clearFirestore, closeClients } from "./helpers";

const hash = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");
const CODE = "ABCD2345";

async function member(claims: { inc: string; role: string; team: string | null }): Promise<string> {
  const u = await admin.auth.createUser({});
  await admin.auth.setCustomUserClaims(u.uid, claims);
  return u.uid;
}
const caller = (uid: string, token: Record<string, unknown>) => ({ uid, token });

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, "expected a rejection").not.toBeNull();
  expect((err as { code?: string }).code).toBe(code);
}

let cmd = "", searcher = "", family = "", otherCmd = "", outsider = "";
beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I1/teams/T1").set({ teamId: "T1", name: "Team 1", colorSlot: 1 });
  await admin.db.doc("incidents/I2").set({ name: "Other drill", mode: "drill", status: "open" });
  await admin.db.doc(`joinCodes/${hash(CODE)}`).set({ incidentId: "I1", roles: ["searcher"] });
  cmd = await member({ inc: "I1", role: "command", team: null });
  searcher = await member({ inc: "I1", role: "searcher", team: "T1" });
  family = await member({ inc: "I1", role: "family", team: null });
  otherCmd = await member({ inc: "I1", role: "command", team: null });
  outsider = await member({ inc: "I2", role: "searcher", team: "T1" });
});
afterAll(closeClients);

const asCmd = () => caller(cmd, { inc: "I1", role: "command" });

describe("removeMember: command removes a searcher or family member of its own incident", () => {
  it("records the removal first, then clears the member's claims and revokes its refresh tokens", async () => {
    // Revocation sets tokensValidAfterTime to now (a new emulator user may have none yet); tokens issued earlier stop refreshing.
    const start = Math.floor(Date.now() / 1000) * 1000;
    expect(await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: searcher })).toEqual({ removed: true });
    const rec = await admin.db.doc(`incidents/I1/removed/${searcher}`).get();
    expect(rec.exists).toBe(true);
    expect(rec.get("removedBy")).toBe(cmd);
    expect(rec.get("role")).toBe("searcher");
    expect(rec.get("removedAt")).toBeTruthy();
    const after = await admin.auth.getUser(searcher);
    expect(after.customClaims?.["inc"]).toBeUndefined();
    expect(after.customClaims?.["role"]).toBeUndefined();
    expect(after.tokensValidAfterTime).toBeTruthy();
    expect(Date.parse(after.tokensValidAfterTime!)).toBeGreaterThanOrEqual(start);
  });

  it("removes a family member too, and a second removal of the same member is ok", async () => {
    await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: family });
    expect(await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: family })).toEqual({ removed: true });
    expect((await admin.db.doc(`incidents/I1/removed/${family}`).get()).get("role")).toBe("family");
  });

  it("refuses a caller who is not this incident's command", async () => {
    await expectCode(handleRemoveMember(admin.db, admin.auth, null, { incidentId: "I1", uid: family }), "unauthenticated");
    await expectCode(handleRemoveMember(admin.db, admin.auth, caller(searcher, { inc: "I1", role: "searcher" }), { incidentId: "I1", uid: family }), "permission-denied");
    await expectCode(handleRemoveMember(admin.db, admin.auth, caller(family, { inc: "I1", role: "family" }), { incidentId: "I1", uid: searcher }), "permission-denied");
    await expectCode(handleRemoveMember(admin.db, admin.auth, caller(outsider, { inc: "I2", role: "command" }), { incidentId: "I1", uid: searcher }), "permission-denied");
    expect((await admin.db.doc(`incidents/I1/removed/${searcher}`).get()).exists).toBe(false);
  });

  it("refuses removing yourself, another command, a member of another incident, or someone unknown", async () => {
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: cmd }), "failed-precondition");
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: otherCmd }), "permission-denied");
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: outsider }), "not-found");
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: "no-such-user" }), "not-found");
    expect((await admin.auth.getUser(outsider)).customClaims?.["inc"]).toBe("I2");
    expect((await admin.auth.getUser(otherCmd)).customClaims?.["role"]).toBe("command");
  });

  it("refuses malformed input before reading anything", async () => {
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I 1", uid: searcher }), "invalid-argument");
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: "" }), "invalid-argument");
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), null), "invalid-argument");
  });
});

describe("a removed member cannot join the same incident again with that account", () => {
  it("refuses the join with the same message as any failed join", async () => {
    await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: searcher });
    const err = await handleJoin(searcher, { joinCode: CODE, role: "searcher", teamId: "T1" }).then(() => null, (e: unknown) => e as { code?: string });
    expect(err?.code).toBe("permission-denied");
    expect((await admin.auth.getUser(searcher)).customClaims?.["inc"]).toBeUndefined();
  });
  it("a new account still joins with the code (command rotates the code for that)", async () => {
    await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: searcher });
    const fresh = (await admin.auth.createUser({})).uid;
    expect(await handleJoin(fresh, { joinCode: CODE, role: "searcher", teamId: "T1" })).toMatchObject({ ok: true, incidentId: "I1" });
  });
});

describe("removal decides from the membership record, not the account's current claims", () => {
  it("joining writes a server-owned members record with the role and team", async () => {
    const fresh = (await admin.auth.createUser({})).uid;
    await handleJoin(fresh, { joinCode: CODE, role: "searcher", teamId: "T1" });
    const m = await admin.db.doc(`incidents/I1/members/${fresh}`).get();
    expect(m.get("role")).toBe("searcher");
    expect(m.get("team")).toBe("T1");
    expect(m.get("joinedAt")).toBeTruthy();
  });
  it("removes a member who has since joined another incident; its new incident's claims and sessions are left alone", async () => {
    const moved = (await admin.auth.createUser({})).uid;
    await handleJoin(moved, { joinCode: CODE, role: "searcher", teamId: "T1" });
    await admin.auth.setCustomUserClaims(moved, { inc: "I2", role: "searcher", team: "T1" });
    expect(await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: moved })).toEqual({ removed: true });
    expect((await admin.db.doc(`incidents/I1/removed/${moved}`).get()).get("role")).toBe("searcher");
    expect((await admin.auth.getUser(moved)).customClaims?.["inc"]).toBe("I2");
  });
  it("a member record that says command cannot be removed, whatever its claims say now", async () => {
    await admin.db.doc(`incidents/I1/members/${searcher}`).set({ role: "command", team: null, joinedAt: new Date() });
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: searcher }), "permission-denied");
  });
});

describe("the caller's current claims, not only its token", () => {
  it("refuses a caller whose token says command but whose current claims do not", async () => {
    await expectCode(handleRemoveMember(admin.db, admin.auth, caller(searcher, { inc: "I1", role: "command" }), { incidentId: "I1", uid: family }), "permission-denied");
    expect((await admin.db.doc(`incidents/I1/removed/${family}`).get()).exists).toBe(false);
  });
  it("refuses a command account that has itself been removed", async () => {
    await admin.db.doc(`incidents/I1/removed/${cmd}`).set({ removedAt: new Date(), removedBy: otherCmd, role: "command" });
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: family }), "permission-denied");
  });
});

describe("cleanup", () => {
  it("a failure other than a missing account is reported, after the record is written", async () => {
    const flaky = {
      getUser: (uid: string) => admin.auth.getUser(uid),
      setCustomUserClaims: () => Promise.reject(Object.assign(new Error("backend down"), { code: "auth/internal-error" })),
      revokeRefreshTokens: (uid: string) => admin.auth.revokeRefreshTokens(uid),
    };
    await expect(handleRemoveMember(admin.db, flaky, asCmd(), { incidentId: "I1", uid: searcher })).rejects.toThrow("backend down");
    expect((await admin.db.doc(`incidents/I1/removed/${searcher}`).get()).exists).toBe(true);
  });
  it("a member whose account is already gone is removed without error", async () => {
    await admin.auth.deleteUser(family);
    await admin.db.doc(`incidents/I1/members/${family}`).set({ role: "family", team: null, joinedAt: new Date() });
    expect(await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: family })).toEqual({ removed: true });
  });
});

describe("cleanup and joins, review round 2", () => {
  it("a failed revocation is retried: revoke comes before clearing the claims", async () => {
    let calls = 0;
    const failsOnce = {
      getUser: (uid: string) => admin.auth.getUser(uid),
      setCustomUserClaims: (uid: string, c: object | null) => admin.auth.setCustomUserClaims(uid, c),
      revokeRefreshTokens: (uid: string) => (calls++ === 0 ? Promise.reject(Object.assign(new Error("revoke failed"), { code: "auth/internal-error" })) : admin.auth.revokeRefreshTokens(uid)),
    };
    await expect(handleRemoveMember(admin.db, failsOnce, asCmd(), { incidentId: "I1", uid: searcher })).rejects.toThrow("revoke failed");
    expect((await admin.auth.getUser(searcher)).customClaims?.["inc"]).toBe("I1");
    await handleRemoveMember(admin.db, failsOnce, asCmd(), { incidentId: "I1", uid: searcher });
    expect(calls).toBe(2);
    expect((await admin.auth.getUser(searcher)).customClaims?.["inc"]).toBeUndefined();
  });
  it("a removed account does not use up a limited invite", async () => {
    await admin.db.doc(`joinCodes/${hash("MXTD2345")}`).set({ incidentId: "I1", roles: ["family"], maxUses: 1, uses: 0 });
    await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: family });
    const err = await handleJoin(family, { joinCode: "MXTD2345", role: "family" }).then(() => null, (e: unknown) => e as { code?: string });
    expect(err?.code).toBe("permission-denied");
    expect((await admin.db.doc(`joinCodes/${hash("MXTD2345")}`).get()).get("uses")).toBe(0);
  });
});

describe("the incident must still be there", () => {
  it("refuses removal from a missing or expired incident and writes no removal record; a closed one still allows it", async () => {
    const ghostCmd = await member({ inc: "GONE", role: "command", team: null });
    const ghostMember = await member({ inc: "GONE", role: "searcher", team: "T1" });
    await expectCode(handleRemoveMember(admin.db, admin.auth, caller(ghostCmd, { inc: "GONE", role: "command" }), { incidentId: "GONE", uid: ghostMember }), "permission-denied");
    expect((await admin.db.doc(`incidents/GONE/removed/${ghostMember}`).get()).exists).toBe(false);
    await admin.db.doc("incidents/I1").update({ expiresAt: new Date(Date.now() - 1000) });
    await expectCode(handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: searcher }), "permission-denied");
    await admin.db.doc("incidents/I1").update({ expiresAt: null, status: "closed", closedReason: "found" });
    expect(await handleRemoveMember(admin.db, admin.auth, asCmd(), { incidentId: "I1", uid: searcher })).toEqual({ removed: true });
  });
});

