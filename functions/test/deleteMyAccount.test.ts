import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "firebase-admin/storage";
import { handleDeleteMyAccount } from "../src/account";
import { handleDeleteMedia } from "../src/media";
import { handleRemoveMember } from "../src/members";
import { admin, adminApp, clearFirestore, closeClients } from "./helpers";

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
    expect(await handleDeleteMyAccount(admin.auth, u.uid)).toEqual({ ok: true });
    const gone = await admin.auth.getUser(u.uid).then(() => false, (e: unknown) => (e as { code?: string }).code === "auth/user-not-found");
    expect(gone).toBe(true);
    expect((await admin.db.doc("incidents/I1/events/e1").get()).exists).toBe(true);
  });
  it("answers ok again when the user is already gone, so a retry after a lost reply is safe", async () => {
    const u = await admin.auth.createUser({});
    await handleDeleteMyAccount(admin.auth, u.uid);
    expect(await handleDeleteMyAccount(admin.auth, u.uid)).toEqual({ ok: true });
  });
  it("deletes only the caller: another user stays", async () => {
    const me = await admin.auth.createUser({}), other = await admin.auth.createUser({});
    await handleDeleteMyAccount(admin.auth, me.uid);
    expect((await admin.auth.getUser(other.uid)).uid).toBe(other.uid);
  });
  it("refuses a caller who is not signed in", async () => {
    await expectCode(handleDeleteMyAccount(admin.auth, null), "unauthenticated");
  });
  it("refuses a command account, which keeps its sign-in (only a searcher or family member leaves this way)", async () => {
    const cmd = await admin.auth.createUser({});
    await admin.auth.setCustomUserClaims(cmd.uid, { inc: "I1", role: "command", team: null });
    const err = await handleDeleteMyAccount(admin.auth, cmd.uid).then(() => null, (e: unknown) => e as { code?: string; details?: { reason?: string } });
    expect(err?.code).toBe("failed-precondition");
    expect(err?.details?.reason).toBe("command_account");
    expect((await admin.auth.getUser(cmd.uid)).uid).toBe(cmd.uid);
  });
  it("deletes an account with no claims (it never joined, or command removed it)", async () => {
    const u = await admin.auth.createUser({});
    expect(await handleDeleteMyAccount(admin.auth, u.uid)).toEqual({ ok: true });
    expect(await admin.auth.getUser(u.uid).then(() => "exists", () => "gone")).toBe("gone");
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

