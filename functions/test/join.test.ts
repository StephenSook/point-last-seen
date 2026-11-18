import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { joinIncident } from "../src/index";
import { handleJoin } from "../src/join";
import { admin, clearFirestore, closeClients } from "./helpers";

const hash = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");
const CODE = "ABCD2345", FAMILY_CODE = "FMRY2345", COMMAND_CODE = "WXYZ6789";
let uid = "";

async function freshUser(): Promise<string> {
  const u = await admin.auth.createUser({});
  return u.uid;
}

beforeEach(async () => {
  await clearFirestore();
  // Join code hashes live in joinCodes/{sha256(code)}, which no client can read (a 40-bit code hash in a
  // member-readable doc could be brute-forced offline into the command code).
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I1/teams/T1").set({ teamId: "T1", name: "Team 1", colorSlot: 1 });
  // One code per role: a searcher's code must never admit family (profile/command) or command.
  await admin.db.doc(`joinCodes/${hash(CODE)}`).set({ incidentId: "I1", roles: ["searcher"] });
  await admin.db.doc(`joinCodes/${hash(FAMILY_CODE)}`).set({ incidentId: "I1", roles: ["family"] });
  await admin.db.doc(`joinCodes/${hash(COMMAND_CODE)}`).set({ incidentId: "I1", roles: ["command"] });
  await admin.db.doc("incidents/I2").set({ name: "Other drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I9").set({ name: "Old drill", mode: "drill", status: "closed" });
  await admin.db.doc(`joinCodes/${hash("QRST2345")}`).set({ incidentId: "I9", roles: ["family"] });
  await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() - 60_000) });
  await admin.db.doc(`joinCodes/${hash("JDGE2345")}`).set({ incidentId: "J1", roles: ["family"] });
  await admin.db.doc(`joinCodes/${hash("TWOR2345")}`).set({ incidentId: "I1", roles: ["searcher", "family"] });
  uid = await freshUser();
});
afterAll(closeClients);

/** Invokes the exported HTTP handler with a minimal request and response, as the Functions runtime would. */
async function callRaw(r: { method: string; body: unknown }): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: "https://example.test" };
  const req = {
    method: r.method, url: "/", headers, body: r.body, rawBody: Buffer.from(JSON.stringify(r.body)),
    header: (n: string) => headers[n.toLowerCase()], get: (n: string) => headers[n.toLowerCase()],
  };
  return await new Promise(resolve => {
    let status = 200;
    const out: Record<string, unknown> = {};
    const res = {
      statusCode: 200,
      setHeader: (k: string, v: unknown) => { out[k.toLowerCase()] = v; },
      getHeader: (k: string) => out[k.toLowerCase()],
      removeHeader: (k: string) => { delete out[k.toLowerCase()]; },
      status(code: number) { status = code; this.statusCode = code; return this; },
      json(body: unknown) { resolve({ status, body }); return this; },
      send(body: unknown) { resolve({ status, body }); return this; },
      end(body?: unknown) { resolve({ status: this.statusCode ?? status, body }); return this; },
      on: () => res, once: () => res,
    };
    void (joinIncident as unknown as (q: unknown, s: unknown) => unknown)(req, res);
  });
}

/** HttpsError carries its code in .code (the message is the human text). */
async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, "expected a rejection").not.toBeNull();
  expect((err as { code?: string }).code).toBe(code);
}

const claimsOf = async (u: string) => (await admin.auth.getUser(u)).customClaims;

describe("joinIncident (spec sections 7 and 14)", () => {
  it("rejects a wrong code and sets claims on a right one", async () => {
    await expectCode(handleJoin(uid, { incidentId: "I1", joinCode: "WRONG000", role: "searcher", teamId: "T1" }), "permission-denied");
    expect(await claimsOf(uid)).toBeUndefined();
    await expect(handleJoin(uid, { incidentId: "I1", joinCode: CODE, role: "searcher", teamId: "T1" })).resolves.toEqual({ ok: true, incidentId: "I1" });
    expect(await claimsOf(uid)).toEqual({ inc: "I1", role: "searcher", team: "T1" });
  });
  it("finds the open incident from the code alone and normalizes case, spaces and hyphens", async () => {
    await expect(handleJoin(uid, { joinCode: "fmry-2345 ", role: "family" })).resolves.toEqual({ ok: true, incidentId: "I1" });
    expect(await claimsOf(uid)).toEqual({ inc: "I1", role: "family", team: null });
  });
  it("command needs the command code; the team code never grants command", async () => {
    await expectCode(handleJoin(uid, { incidentId: "I1", joinCode: CODE, role: "command" }), "permission-denied");
    await expect(handleJoin(uid, { incidentId: "I1", joinCode: COMMAND_CODE, role: "command" })).resolves.toEqual({ ok: true, incidentId: "I1" });
    expect(await claimsOf(uid)).toEqual({ inc: "I1", role: "command", team: null });
  });
  it("each code admits exactly its own role: the searcher code never grants family or command", async () => {
    await expectCode(handleJoin(uid, { joinCode: CODE, role: "family" }), "permission-denied");
    await expectCode(handleJoin(uid, { joinCode: FAMILY_CODE, role: "searcher", teamId: "T1" }), "permission-denied");
    await expectCode(handleJoin(uid, { joinCode: FAMILY_CODE, role: "command" }), "permission-denied");
    expect(await claimsOf(uid)).toBeUndefined();
  });
  it("a code doc that lists more than one role is refused for every role", async () => {
    await expectCode(handleJoin(uid, { joinCode: "TWOR2345", role: "searcher", teamId: "T1" }), "permission-denied");
    await expectCode(handleJoin(uid, { joinCode: "TWOR2345", role: "family" }), "permission-denied");
  });
  it("a searcher must name a team; an unknown team gets the same refusal as a wrong code", async () => {
    await expectCode(handleJoin(uid, { incidentId: "I1", joinCode: CODE, role: "searcher" }), "invalid-argument");
    const wrongCode = await handleJoin(uid, { joinCode: "ZZZZ2345", role: "family" }).catch((e: Error) => e.message);
    const unknownTeam = await handleJoin(uid, { incidentId: "I1", joinCode: CODE, role: "searcher", teamId: "T7" }).catch((e: Error) => e.message);
    await expectCode(handleJoin(uid, { incidentId: "I1", joinCode: CODE, role: "searcher", teamId: "T7" }), "permission-denied");
    expect(unknownTeam).toBe(wrongCode);
  });
  it("a code that is not 8 Crockford symbols is refused before any lookup", async () => {
    for (const bad of ["ABC", "ABCD23456", "ABCD234I", "ABCD234O", "ABCDLLLL"]) {
      await expectCode(handleJoin(uid, { joinCode: bad, role: "family" }), "permission-denied");
    }
  });
  it("a caller gets 10 join attempts per hour, then even the right code is refused", async () => {
    for (let i = 0; i < 10; i++) await expectCode(handleJoin(uid, { joinCode: "ZZZZ2345", role: "family" }), "permission-denied");
    await expectCode(handleJoin(uid, { joinCode: FAMILY_CODE, role: "family" }), "resource-exhausted");
    expect(await claimsOf(uid)).toBeUndefined();
    const other = await freshUser();
    await expect(handleJoin(other, { joinCode: FAMILY_CODE, role: "family" })).resolves.toEqual({ ok: true, incidentId: "I1" });
  });
  it("an invite can carry an expiry and a use limit", async () => {
    await admin.db.doc(`joinCodes/${hash("PAST2345")}`).set({ incidentId: "I1", roles: ["command"], expiresAt: new Date(Date.now() - 1000) });
    await expectCode(handleJoin(uid, { joinCode: "PAST2345", role: "command" }), "permission-denied");
    await admin.db.doc(`joinCodes/${hash("NCEX2345")}`).set({ incidentId: "I1", roles: ["command"], maxUses: 1, uses: 0 });
    await expect(handleJoin(uid, { joinCode: "NCEX2345", role: "command" })).resolves.toEqual({ ok: true, incidentId: "I1" });
    const second = await freshUser();
    await expectCode(handleJoin(second, { joinCode: "NCEX2345", role: "command" }), "permission-denied");
    expect(await claimsOf(second)).toBeUndefined();
  });
  it("a closed incident cannot be joined, even with its code", async () => {
    await expectCode(handleJoin(uid, { incidentId: "I9", joinCode: "QRST2345", role: "searcher", teamId: "T1" }), "permission-denied");
    await expectCode(handleJoin(uid, { joinCode: "QRST2345", role: "family" }), "permission-denied");
  });
  it("a judge incident needs a future timestamp expiry to be joined", async () => {
    await admin.db.doc("incidents/J2").set({ name: "Judge", mode: "judge", status: "open" });
    await admin.db.doc(`joinCodes/${hash("JDGE6789")}`).set({ incidentId: "J2", roles: ["command"] });
    await expectCode(handleJoin(uid, { joinCode: "JDGE6789", role: "command" }), "permission-denied");
    await admin.db.doc("incidents/J2").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3600_000) });
    await expect(handleJoin(uid, { joinCode: "JDGE6789", role: "command" })).resolves.toEqual({ ok: true, incidentId: "J2" });
  });
  it("an expired judge incident cannot be joined", async () => {
    await expectCode(handleJoin(uid, { joinCode: "JDGE2345", role: "family" }), "permission-denied");
  });
  it("a valid code given with another OPEN incident's id is rejected at the incident check", async () => {
    // I1's command code, the right role, but incident I2 (open): only the incident comparison can refuse it.
    await expectCode(handleJoin(uid, { incidentId: "I2", joinCode: COMMAND_CODE, role: "command" }), "permission-denied");
    expect(await claimsOf(uid)).toBeUndefined();
  });
  it("a legacy two-role code doc grants neither role (the pre-fix handler granted both)", async () => {
    await expectCode(handleJoin(uid, { joinCode: "TWOR2345", role: "family" }), "permission-denied");
    expect(await claimsOf(uid)).toBeUndefined();
    await expectCode(handleJoin(uid, { joinCode: "TWOR2345", role: "searcher", teamId: "T1" }), "permission-denied");
    expect(await claimsOf(uid)).toBeUndefined();
  });
  it("rejects a malformed request and an unknown role", async () => {
    await expectCode(handleJoin(uid, { joinCode: 5, role: "family" } as never), "invalid-argument");
    await expectCode(handleJoin(uid, { joinCode: CODE, role: "admin" } as never), "invalid-argument");
    await expectCode(handleJoin(uid, null as never), "invalid-argument");
  });
  it("requires a signed-in caller", async () => {
    await expectCode(handleJoin(null, { incidentId: "I1", joinCode: CODE, role: "family" }), "unauthenticated");
  });
  it("the exported callable refuses a request without an App Check token", async () => {
    const res = await callRaw({ method: "POST", body: { data: { joinCode: CODE, role: "family" } } });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toMatch(/UNAUTHENTICATED/);
  });
  it("control: the same harness sees a different status for a malformed request", async () => {
    const res = await callRaw({ method: "POST", body: { notData: 1 } });
    expect(res.status).toBe(400);
  });
});
