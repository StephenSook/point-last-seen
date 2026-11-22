import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "firebase-admin/storage";
import { handleDeleteMyAccount } from "../src/account";
import { handleDeleteMedia } from "../src/media";
import { handleRemoveMember } from "../src/members";
import { doc, getDoc } from "firebase/firestore";
import { admin, adminApp, assertFails, assertSucceeds, clearFirestore, closeClients, dbAs } from "./helpers";

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, "expected a rejection").not.toBeNull();
  expect((err as { code?: string }).code).toBe(code);
}

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("deleteMyAccount: the caller deletes its own sign-in", () => {
  it("deletes the caller's Auth user and answers ok; its reports stay in the incident", async () => {
    const u = await admin.auth.createUser({});
    await admin.auth.setCustomUserClaims(u.uid, { inc: "I1", role: "searcher", team: "T1" });
    await admin.db.doc("incidents/I1/events/e1").set({ authorUid: u.uid, type: "clue" });
    expect(await handleDeleteMyAccount(admin.db, admin.auth, u.uid)).toEqual({ ok: true });
    const gone = await admin.auth.getUser(u.uid).then(() => false, (e: unknown) => (e as { code?: string }).code === "auth/user-not-found");
    expect(gone).toBe(true);
    expect((await admin.db.doc("incidents/I1/events/e1").get()).exists).toBe(true);
  });
  it("answers ok again when the user is already gone, so a retry after a lost reply is safe", async () => {
    const u = await admin.auth.createUser({});
    await handleDeleteMyAccount(admin.db, admin.auth, u.uid);
    expect(await handleDeleteMyAccount(admin.db, admin.auth, u.uid)).toEqual({ ok: true });
  });
  it("deletes only the caller: another user stays", async () => {
    const me = await admin.auth.createUser({}), other = await admin.auth.createUser({});
    await handleDeleteMyAccount(admin.db, admin.auth, me.uid);
    expect((await admin.auth.getUser(other.uid)).uid).toBe(other.uid);
  });
  it("refuses a caller who is not signed in", async () => {
    await expectCode(handleDeleteMyAccount(admin.db, admin.auth, null), "unauthenticated");
  });
  it("refuses a command account, which keeps its sign-in (only a searcher or family member leaves this way)", async () => {
    const cmd = await admin.auth.createUser({});
    await admin.auth.setCustomUserClaims(cmd.uid, { inc: "I1", role: "command", team: null });
    const err = await handleDeleteMyAccount(admin.db, admin.auth, cmd.uid).then(() => null, (e: unknown) => e as { code?: string; details?: { reason?: string } });
    expect(err?.code).toBe("failed-precondition");
    expect(err?.details?.reason).toBe("command_account");
    expect((await admin.auth.getUser(cmd.uid)).uid).toBe(cmd.uid);
  });
  it("deletes an account with no claims (it never joined, or command removed it)", async () => {
    const u = await admin.auth.createUser({});
    expect(await handleDeleteMyAccount(admin.db, admin.auth, u.uid)).toEqual({ ok: true });
    expect(await admin.auth.getUser(u.uid).then(() => "exists", () => "gone")).toBe("gone");
  });
});

const exists = async (path: string) => (await admin.db.doc(path).get()).exists;
const userGone = async (uid: string) => admin.auth.getUser(uid).then(() => false, (e: unknown) => (e as { code?: string }).code === "auth/user-not-found");

async function searcherIn(inc: string): Promise<string> {
  const u = await admin.auth.createUser({});
  await admin.auth.setCustomUserClaims(u.uid, { inc, role: "searcher", team: "T1" });
  await admin.db.doc(`incidents/${inc}/members/${u.uid}`).set({ role: "searcher", team: "T1", joinedAt: new Date() });
  return u.uid;
}

describe("deleteMyAccount: the caller's member records go before its sign-in", () => {
  it("deletes the member record, then the user; its events and content reports stay", async () => {
    const uid = await searcherIn("I1");
    await admin.db.doc("incidents/I1/events/e1").set({ deviceId: uid, type: "cleared" });
    await admin.db.doc("incidents/I1/contentReports/r1").set({ authorUid: uid, target: "task" });
    expect(await handleDeleteMyAccount(admin.db, admin.auth, uid)).toEqual({ ok: true });
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(false);
    expect(await userGone(uid)).toBe(true);
    expect(await exists("incidents/I1/events/e1")).toBe(true);
    expect(await exists("incidents/I1/contentReports/r1")).toBe(true);
  });
  it("deletes the record in an incident the claims no longer name (the account joined another one later)", async () => {
    await admin.db.doc("incidents/I2").set({ name: "Later drill", mode: "drill", status: "open" });
    const uid = await searcherIn("I1");
    await admin.auth.setCustomUserClaims(uid, { inc: "I2", role: "searcher", team: "T1" });
    await admin.db.doc(`incidents/I2/members/${uid}`).set({ role: "searcher", team: "T1", joinedAt: new Date() });
    await handleDeleteMyAccount(admin.db, admin.auth, uid);
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(false);
    expect(await exists(`incidents/I2/members/${uid}`)).toBe(false);
  });
  it("deletes the record of a member command removed (claims cleared), and keeps command's removal record", async () => {
    const uid = await searcherIn("I1");
    await admin.db.doc(`incidents/I1/removed/${uid}`).set({ removedAt: new Date(), removedBy: "cmd", role: "searcher", team: "T1" });
    await admin.auth.setCustomUserClaims(uid, {});
    await handleDeleteMyAccount(admin.db, admin.auth, uid);
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(false);
    expect((await admin.db.doc(`incidents/I1/removed/${uid}`).get()).get("removedBy")).toBe("cmd");
    expect(await userGone(uid)).toBe(true);
  });
  it("deletes only the caller's record: another member's stays", async () => {
    const me = await searcherIn("I1"), other = await searcherIn("I1");
    await handleDeleteMyAccount(admin.db, admin.auth, me);
    expect(await exists(`incidents/I1/members/${other}`)).toBe(true);
  });
  it("answers ok again on a repeat, with the record and the user already gone", async () => {
    const uid = await searcherIn("I1");
    await handleDeleteMyAccount(admin.db, admin.auth, uid);
    expect(await handleDeleteMyAccount(admin.db, admin.auth, uid)).toEqual({ ok: true });
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(false);
  });
  it("deletes the record for a caller whose user is already gone (its token is still valid for up to an hour)", async () => {
    const uid = await searcherIn("I1");
    await admin.auth.deleteUser(uid);
    expect(await handleDeleteMyAccount(admin.db, admin.auth, uid)).toEqual({ ok: true });
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(false);
  });
  it("leaves the record gone and the user in place when the Auth delete fails, so a retry finishes", async () => {
    const uid = await searcherIn("I1");
    const failing = { getUser: (u: string) => admin.auth.getUser(u),
      deleteUser: async () => { throw Object.assign(new Error("auth down"), { code: "auth/internal-error" }); } };
    await expectCode(handleDeleteMyAccount(admin.db, failing, uid), "auth/internal-error");
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(false);
    expect(await userGone(uid)).toBe(false);
    expect(await handleDeleteMyAccount(admin.db, admin.auth, uid)).toEqual({ ok: true });
    expect(await userGone(uid)).toBe(true);
  });
  it("refuses an account that is command in any incident, and deletes nothing", async () => {
    await admin.db.doc("incidents/I2").set({ name: "Other drill", mode: "drill", status: "open" });
    const uid = await searcherIn("I1");
    await admin.db.doc(`incidents/I2/members/${uid}`).set({ role: "command", team: null, joinedAt: new Date() });
    const err = await handleDeleteMyAccount(admin.db, admin.auth, uid).then(() => null, (e: unknown) => e as { code?: string; details?: { reason?: string } });
    expect(err?.code).toBe("failed-precondition");
    expect(err?.details?.reason).toBe("command_account");
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(true);
    expect(await userGone(uid)).toBe(false);
  });
  it("refuses the old sign-in at once: a record under removed/ with only the time, so the rules deny its token", async () => {
    const uid = await searcherIn("I1");
    const asOld = dbAs(uid, { inc: "I1", role: "searcher", team: "T1" });
    await assertSucceeds(getDoc(doc(asOld, "incidents/I1")));
    await handleDeleteMyAccount(admin.db, admin.auth, uid);
    const rec = await admin.db.doc(`incidents/I1/removed/${uid}`).get();
    expect(Object.keys(rec.data() ?? {}).sort()).toEqual(["removedAt", "removedBy"]);
    expect(rec.get("removedBy")).toBe(uid);
    await assertFails(getDoc(doc(asOld, "incidents/I1")));
  });
  it("deletes the record of an account whose id has a period (a custom or imported sign-in)", async () => {
    const u = await admin.auth.createUser({ uid: "searcher.legacy" });
    await admin.auth.setCustomUserClaims(u.uid, { inc: "I1", role: "searcher", team: "T1" });
    await admin.db.doc(`incidents/I1/members/${u.uid}`).set({ role: "searcher", team: "T1", joinedAt: new Date() });
    expect(await handleDeleteMyAccount(admin.db, admin.auth, u.uid)).toEqual({ ok: true });
    expect(await exists(`incidents/I1/members/${u.uid}`)).toBe(false);
  });
  it("fails the call, deleting nothing, when the writes would not fit in one batch", async () => {
    await admin.db.doc("incidents/I2").set({ name: "Two", mode: "drill", status: "open" });
    const uid = await searcherIn("I1");
    await admin.db.doc(`incidents/I2/members/${uid}`).set({ role: "searcher", team: "T1", joinedAt: new Date() });
    const err = await handleDeleteMyAccount(admin.db, admin.auth, uid, { maxWrites: 3 })
      .then(() => null, (e: unknown) => e as { code?: string; details?: { reason?: string } });
    expect(err?.code).toBe("resource-exhausted");
    expect(err?.details?.reason).toBe("too_many_records");
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(true);
    expect(await exists(`incidents/I2/members/${uid}`)).toBe(true);
    expect(await userGone(uid)).toBe(false);
  });
  it("fails the call, deleting nothing, when there are more incidents than it checks", async () => {
    await admin.db.doc("incidents/I2").set({ name: "Two", mode: "drill", status: "open" });
    await admin.db.doc("incidents/I3").set({ name: "Three", mode: "drill", status: "open" });
    const uid = await searcherIn("I1");
    const err = await handleDeleteMyAccount(admin.db, admin.auth, uid, { maxIncidents: 2 })
      .then(() => null, (e: unknown) => e as { code?: string; details?: { reason?: string } });
    expect(err?.code).toBe("resource-exhausted");
    expect(err?.details?.reason).toBe("too_many_incidents");
    expect(await exists(`incidents/I1/members/${uid}`)).toBe(true);
    expect(await userGone(uid)).toBe(false);
  });
});

describe("a deleted account's token, still valid for up to an hour, grants no command action", () => {
  it("removeMember and deleteIncidentMediaNow refuse a command whose account is gone", async () => {
    const cmd = await admin.auth.createUser({});
    await admin.auth.setCustomUserClaims(cmd.uid, { inc: "I1", role: "command", team: null });
    const member = await admin.auth.createUser({});
    await admin.auth.setCustomUserClaims(member.uid, { inc: "I1", role: "searcher", team: "T1" });
    await admin.auth.deleteUser(cmd.uid);
    const oldToken = { uid: cmd.uid, token: { inc: "I1", role: "command" } };
    await expectCode(handleRemoveMember(admin.db, admin.auth, oldToken, { incidentId: "I1", uid: member.uid }), "permission-denied");
    await expectCode(handleDeleteMedia(admin.db, admin.auth, getStorage(adminApp).bucket(), oldToken, { incidentId: "I1" }), "permission-denied");
    expect((await admin.db.doc(`incidents/I1/removed/${member.uid}`).get()).exists).toBe(false);
  });
});

