import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleDeleteMyAccount } from "../src/account";
import { admin, clearFirestore, closeClients } from "./helpers";

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
});
