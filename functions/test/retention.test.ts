// Drill retention: a drill's data is deleted 30 days after the search command closes it. closedAt is written by the
// server when a drill becomes closed; the daily job deletes the drill (Firestore, its media prefixes, its join codes)
// and the anonymous sign-ins that belonged only to it. A purge record outside the incident lets an interrupted
// purge finish on the next run. A keep-list protects the drills the judge page and the film use.
import { getStorage } from "firebase-admin/storage";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closesDrill, deleteEndedDrills, DRILL_RETENTION_MS, keptUntil, PURGES, recordDrillClosed } from "../src/retention";
import { admin, adminApp, clearFirestore, closeClients } from "./helpers";

const bucket = getStorage(adminApp).bucket();
const NOW = Date.UTC(2026, 11, 12, 15, 0);
const DAY = 86_400_000;
const put = (path: string) => bucket.file(path).save(Buffer.from(path), { contentType: "application/octet-stream" });
const exists = async (path: string) => (await bucket.file(path).exists())[0];
const inc = (id: string) => admin.db.doc(`incidents/${id}`);
const closed = (daysAgo: number) => ({ status: "closed", closedAt: Timestamp.fromMillis(NOW - daysAgo * DAY) });
const media = (id: string) => [`clips/${id}/${"a".repeat(64)}.mp4`, `photos/${id}/${"b".repeat(64)}.jpg`, `packs/${id}/T1/v1.bundle`];
type B = Parameters<typeof deleteEndedDrills>[1];
type A = Parameters<typeof deleteEndedDrills>[2];

async function drill(id: string, over: Record<string, unknown>): Promise<void> {
  await inc(id).set({ name: id, mode: "drill", drillLabel: "Training drill. Nobody is missing.", status: "open", ...over });
  await inc(id).collection("events").doc("e1").set({ type: "sighting" });
  for (const p of media(id)) await put(p);
}

let uidN = 0;
/** A sign-in claimed by incidentId, last used at lastUsedMs (default: before every test drill closed). */
async function member(incidentId: string, anonymous = true, lastUsedMs = Date.UTC(2026, 9, 1)): Promise<string> {
  const uid = `u${uidN++}-${Math.random().toString(36).slice(2, 8)}`;
  const used = new Date(lastUsedMs).toUTCString();
  const r = await admin.auth.importUsers([{ uid, ...(anonymous ? {} : { email: `${uid}@example.com` }),
    customClaims: { inc: incidentId, role: "searcher", team: "T1" }, metadata: { creationTime: used, lastSignInTime: used } }]);
  if (r.failureCount) throw new Error(`importUsers failed: ${r.errors[0]?.error.message}`);
  return uid;
}
const userExists = async (uid: string) => admin.auth.getUser(uid).then(() => true, () => false);
const purge = (id: string) => admin.db.doc(`${PURGES}/${id}`);

beforeEach(async () => {
  await clearFirestore();
  const [files] = await bucket.getFiles();
  await Promise.all(files.map(f => f.delete()));
  const { users } = await admin.auth.listUsers(1000);
  if (users.length) await admin.auth.deleteUsers(users.map(u => u.uid));
});
afterAll(closeClients);

describe("closedAt: the server records when a drill is closed", () => {
  it("counts only a drill moving into closed", () => {
    expect(closesDrill({ mode: "drill", status: "open" }, { mode: "drill", status: "closed" })).toBe(true);
    expect(closesDrill({ mode: "drill", status: "found" }, { mode: "drill", status: "closed" })).toBe(true);
    expect(closesDrill({ mode: "drill", status: "open" }, { mode: "drill", status: "found" })).toBe(false);
    expect(closesDrill({ mode: "drill", status: "closed" }, { mode: "drill", status: "closed" })).toBe(false);
    expect(closesDrill({ mode: "live", status: "open" }, { mode: "live", status: "closed" })).toBe(false);
    expect(closesDrill({ mode: "judge", status: "open" }, { mode: "judge", status: "closed" })).toBe(false);
    expect(closesDrill(undefined, { mode: "drill", status: "closed" })).toBe(false);
    expect(closesDrill({ mode: "drill", status: "open" }, undefined)).toBe(false);
  });

  it("writes the close write's own time, once: a second delivery of the same event changes nothing", async () => {
    await drill("D1", { status: "closed" });
    const at = Timestamp.fromMillis(NOW - 5_000);
    const before = { mode: "drill", status: "open" }, after = { mode: "drill", status: "closed" };
    expect(await recordDrillClosed(admin.db, "D1", before, after, at)).toBe(true);
    expect(await recordDrillClosed(admin.db, "D1", before, after, Timestamp.fromMillis(NOW))).toBe(false);
    expect(((await inc("D1").get()).get("closedAt") as Timestamp).toMillis()).toBe(NOW - 5_000);
  });

  it("writes nothing when the incident is gone or no longer a closed drill", async () => {
    const at = Timestamp.fromMillis(NOW);
    expect(await recordDrillClosed(admin.db, "MISSING", { mode: "drill", status: "open" }, { mode: "drill", status: "closed" }, at)).toBe(false);
    expect((await inc("MISSING").get()).exists).toBe(false);
  });
});

describe("deleteEndedDrills: 30 days after the close", () => {
  it("deletes a drill closed more than 30 days ago, with its events, media and join codes, and clears its purge record", async () => {
    await drill("OLD", closed(31));
    await admin.db.doc("joinCodes/h1").set({ incidentId: "OLD", roles: ["searcher"] });
    await admin.db.doc("joinCodes/h2").set({ incidentId: "OTHER", roles: ["searcher"] });
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW);
    expect(r.deleted).toEqual(["OLD"]);
    expect(r.failed).toEqual([]);
    expect((await inc("OLD").get()).exists).toBe(false);
    expect((await inc("OLD").collection("events").get()).size).toBe(0);
    for (const p of media("OLD")) expect(await exists(p)).toBe(false);
    expect((await admin.db.doc("joinCodes/h1").get()).exists).toBe(false);
    expect((await admin.db.doc("joinCodes/h2").get()).exists).toBe(true);
    expect((await purge("OLD").get()).exists).toBe(false);
  });

  it("keeps a drill closed less than 30 days ago, an open drill, a closed drill with no closedAt, and every non-drill", async () => {
    await drill("RECENT", closed(29));
    await drill("OPEN", {});
    await drill("NOCLOSE", { status: "closed" });
    await drill("LIVE", { mode: "live", ...closed(90) });
    await drill("JUDGE", { mode: "judge", ...closed(90) });
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW);
    expect(r.deleted).toEqual([]);
    for (const id of ["RECENT", "OPEN", "NOCLOSE", "LIVE", "JUDGE"]) expect((await inc(id).get()).exists).toBe(true);
    expect(await exists(`photos/RECENT/${"b".repeat(64)}.jpg`)).toBe(true);
    expect(DRILL_RETENTION_MS).toBe(30 * DAY);
  });

  it("keeps the development and judge seed drills always, and the Kennesaw drill until 2027-01-01", async () => {
    for (const id of ["drill-dev-1", "drill-judge-1", "drill-kennesaw-1"]) await drill(id, closed(60));
    expect((await deleteEndedDrills(admin.db, bucket, admin.auth, NOW)).deleted).toEqual([]);
    expect(keptUntil("drill-kennesaw-1")).toBe(Date.UTC(2027, 0, 1));
    expect(keptUntil("drill-dev-1")).toBe(Number.POSITIVE_INFINITY);
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, Date.UTC(2027, 0, 1));
    expect(r.deleted).toEqual(["drill-kennesaw-1"]);
    expect(r.kept).toEqual(["drill-dev-1", "drill-judge-1"]);
  });

  it("deletes the anonymous sign-ins that belonged only to the deleted drill", async () => {
    await drill("OLD", closed(31));
    await drill("RECENT", closed(1));
    const gone = await member("OLD");
    const elsewhere = await member("RECENT");
    const withEmail = await member("OLD", false);
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW);
    expect(r.users).toBe(1);
    expect(await userExists(gone)).toBe(false);
    expect(await userExists(elsewhere)).toBe(true);
    expect(await userExists(withEmail)).toBe(true);
  });

  it("keeps a sign-in used after the drill closed: it may belong to a person who is still using the app", async () => {
    await drill("OLD", closed(31));
    const active = await member("OLD", true, NOW - 2 * DAY);
    const idle = await member("OLD");
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW);
    expect(r.users).toBe(1);
    expect(await userExists(active)).toBe(true);
    expect(await userExists(idle)).toBe(false);
  });

  it("drops a purge record whose incident id is in use again, and deletes nothing of the new incident", async () => {
    await drill("REUSED", {});
    const newMember = await member("REUSED");
    await admin.db.doc("joinCodes/h9").set({ incidentId: "REUSED", roles: ["command"] });
    await purge("REUSED").set({ startedAt: Timestamp.fromMillis(NOW - DAY), closedAtMs: NOW - 40 * DAY });
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW);
    expect(r.deleted).toEqual([]);
    expect(r.stale).toEqual(["REUSED"]);
    expect((await inc("REUSED").get()).exists).toBe(true);
    expect((await inc("REUSED").collection("events").get()).size).toBe(1);
    for (const p of media("REUSED")) expect(await exists(p)).toBe(true);
    expect((await admin.db.doc("joinCodes/h9").get()).exists).toBe(true);
    expect(await userExists(newMember)).toBe(true);
    expect((await purge("REUSED").get()).exists).toBe(false);
  });

  it("deletes a join code written while the purge ran, by a last sweep after the incident is gone", async () => {
    await drill("OLD", closed(31));
    let calls = 0;
    const racing = {
      getFiles: async (q: { prefix: string }) => {
        // Calls 1 to 3 are the first media sweep; call 4 starts the sweep after the incident is deleted.
        if (++calls === 4) await admin.db.doc("joinCodes/late").set({ incidentId: "OLD", roles: ["searcher"] });
        return bucket.getFiles(q);
      },
    } as unknown as B;
    const r = await deleteEndedDrills(admin.db, racing, admin.auth, NOW);
    expect(r.deleted).toEqual(["OLD"]);
    expect((await admin.db.doc("joinCodes/late").get()).exists).toBe(false);
  });

  it("keeps a sign-in that joined another incident after the user list was read", async () => {
    await drill("OLD", closed(31));
    const moved = await member("OLD");
    const racing = {
      listUsers: async (n?: number, p?: string) => {
        const r = await admin.auth.listUsers(n, p);
        await admin.auth.setCustomUserClaims(moved, { inc: "LIVE-1", role: "searcher", team: "T1" });
        return r;
      },
      getUsers: admin.auth.getUsers.bind(admin.auth),
      deleteUsers: admin.auth.deleteUsers.bind(admin.auth),
    } as unknown as A;
    const r = await deleteEndedDrills(admin.db, bucket, racing, NOW);
    expect(r.users).toBe(0);
    expect(await userExists(moved)).toBe(true);
    expect(r.deleted).toEqual(["OLD"]);
  });

  it("keeps the purge record when a sign-in delete fails, and the next run finishes it", async () => {
    await drill("OLD", closed(31));
    const gone = await member("OLD");
    const failing = {
      listUsers: admin.auth.listUsers.bind(admin.auth),
      getUsers: admin.auth.getUsers.bind(admin.auth),
      deleteUsers: async (uids: string[]) => ({ successCount: 0, failureCount: uids.length, errors: uids.map((_, index) => ({ index, error: new Error("auth down") })) }),
    } as unknown as A;
    const first = await deleteEndedDrills(admin.db, bucket, failing, NOW);
    expect(first.failed).toEqual(["OLD"]);
    expect(first.users).toBe(0);
    expect((await purge("OLD").get()).exists).toBe(true);
    expect((await inc("OLD").get()).exists).toBe(false);
    const second = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW + DAY);
    expect(second.deleted).toEqual(["OLD"]);
    expect(second.users).toBe(1);
    expect(await userExists(gone)).toBe(false);
    expect((await purge("OLD").get()).exists).toBe(false);
  });

  it("finishes an interrupted purge from its record, even with the incident root already gone", async () => {
    await drill("HALF", closed(40));
    const gone = await member("HALF");
    await purge("HALF").set({ startedAt: Timestamp.fromMillis(NOW - DAY), closedAtMs: NOW - 40 * DAY });
    await inc("HALF").delete();
    expect((await inc("HALF").collection("events").get()).size).toBe(1);
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW);
    expect(r.deleted).toEqual(["HALF"]);
    expect((await inc("HALF").collection("events").get()).size).toBe(0);
    for (const p of media("HALF")) expect(await exists(p)).toBe(false);
    expect(await userExists(gone)).toBe(false);
    expect((await purge("HALF").get()).exists).toBe(false);
  });

  it("deletes a photo uploaded while the purge ran, by a last sweep after the incident is gone", async () => {
    await drill("OLD", closed(31));
    let late = true;
    const racing = {
      getFiles: async (q: { prefix: string }) => {
        const r = await bucket.getFiles(q);
        if (late && q.prefix === "photos/OLD/") { late = false; await put(`photos/OLD/${"c".repeat(64)}.jpg`); }
        return r;
      },
    } as unknown as B;
    const r = await deleteEndedDrills(admin.db, racing, admin.auth, NOW);
    expect(r.deleted).toEqual(["OLD"]);
    expect(await exists(`photos/OLD/${"c".repeat(64)}.jpg`)).toBe(false);
  });

  it("leaves the drill and its record when its media cannot be deleted, so the next run tries again", async () => {
    await drill("OLD", closed(31));
    const failing = { getFiles: async () => { throw new Error("storage down"); } } as unknown as B;
    const r = await deleteEndedDrills(admin.db, failing, admin.auth, NOW);
    expect(r.deleted).toEqual([]);
    expect(r.failed).toEqual(["OLD"]);
    expect((await inc("OLD").get()).exists).toBe(true);
    expect((await purge("OLD").get()).exists).toBe(true);
  });

  it("a dry run lists what it would delete and changes nothing, not even a purge record", async () => {
    await drill("OLD", closed(31));
    const gone = await member("OLD");
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW, { dryRun: true });
    expect(r.deleted).toEqual(["OLD"]);
    expect(r.users).toBe(1);
    expect((await inc("OLD").get()).exists).toBe(true);
    expect(await exists("packs/OLD/T1/v1.bundle")).toBe(true);
    expect(await userExists(gone)).toBe(true);
    expect((await purge("OLD").get()).exists).toBe(false);
  });
});
