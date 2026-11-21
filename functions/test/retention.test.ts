// Drill retention: a drill's data is deleted 30 days after the search command closes it. closedAt is written by the
// server when a drill becomes closed; the daily job deletes the drill (Firestore, its media prefixes) and the
// anonymous sign-ins that belonged only to it. A keep-list protects the drills the judge page and the film use.
import { getStorage } from "firebase-admin/storage";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closedAtPatch, deleteEndedDrills, DRILL_RETENTION_MS, keptUntil, recordDrillClosed } from "../src/retention";
import { admin, adminApp, clearFirestore, closeClients } from "./helpers";

const bucket = getStorage(adminApp).bucket();
const NOW = Date.UTC(2026, 11, 12, 15, 0);
const DAY = 86_400_000;
const put = (path: string) => bucket.file(path).save(Buffer.from(path), { contentType: "application/octet-stream" });
const exists = async (path: string) => (await bucket.file(path).exists())[0];
const inc = (id: string) => admin.db.doc(`incidents/${id}`);
const closed = (daysAgo: number) => ({ status: "closed", closedAt: Timestamp.fromMillis(NOW - daysAgo * DAY) });

async function drill(id: string, over: Record<string, unknown>): Promise<void> {
  await inc(id).set({ name: id, mode: "drill", drillLabel: "Training drill. Nobody is missing.", status: "open", ...over });
  await inc(id).collection("events").doc("e1").set({ type: "sighting" });
  for (const p of [`clips/${id}/${"a".repeat(64)}.mp4`, `photos/${id}/${"b".repeat(64)}.jpg`, `packs/${id}/T1/v1.bundle`]) await put(p);
}

async function member(incidentId: string, anonymous = true): Promise<string> {
  const u = await admin.auth.createUser(anonymous ? {} : { email: `${Math.random().toString(36).slice(2)}@example.com` });
  await admin.auth.setCustomUserClaims(u.uid, { inc: incidentId, role: "searcher", team: "T1" });
  return u.uid;
}
const userExists = async (uid: string) => admin.auth.getUser(uid).then(() => true, () => false);

beforeEach(async () => {
  await clearFirestore();
  const [files] = await bucket.getFiles();
  await Promise.all(files.map(f => f.delete()));
  const { users } = await admin.auth.listUsers(1000);
  if (users.length) await admin.auth.deleteUsers(users.map(u => u.uid));
});
afterAll(closeClients);

describe("closedAt: the server records when a drill is closed", () => {
  it("is written once, when a drill's status becomes closed", () => {
    expect(closedAtPatch({ mode: "drill", status: "open" }, { mode: "drill", status: "closed" })).toEqual({ closedAt: FieldValue.serverTimestamp() });
    expect(closedAtPatch({ mode: "drill", status: "found" }, { mode: "drill", status: "closed" })).not.toBeNull();
  });

  it("is not written for any other change, for a live search or a judge sandbox, or a second time", () => {
    expect(closedAtPatch({ mode: "drill", status: "open" }, { mode: "drill", status: "found" })).toBeNull();
    expect(closedAtPatch({ mode: "drill", status: "closed" }, { mode: "drill", status: "closed" })).toBeNull();
    expect(closedAtPatch({ mode: "live", status: "open" }, { mode: "live", status: "closed" })).toBeNull();
    expect(closedAtPatch({ mode: "judge", status: "open" }, { mode: "judge", status: "closed" })).toBeNull();
    expect(closedAtPatch({ mode: "drill", status: "open" }, { mode: "drill", status: "closed", closedAt: Timestamp.fromMillis(NOW) })).toBeNull();
    expect(closedAtPatch(undefined, { mode: "drill", status: "closed" })).toBeNull();
    expect(closedAtPatch({ mode: "drill", status: "open" }, undefined)).toBeNull();
  });

  it("writes the server's time on the incident", async () => {
    await drill("D1", { status: "closed" });
    expect(await recordDrillClosed(admin.db, "D1", { mode: "drill", status: "open" }, { mode: "drill", status: "closed" })).toBe(true);
    const at = (await inc("D1").get()).get("closedAt");
    expect(at).toBeInstanceOf(Timestamp);
    expect(Math.abs(at.toMillis() - Date.now())).toBeLessThan(60_000);
  });
});

describe("deleteEndedDrills: 30 days after the close", () => {
  it("deletes a drill closed more than 30 days ago, with its events and its clips, photos and packs", async () => {
    await drill("OLD", closed(31));
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW);
    expect(r.deleted).toEqual(["OLD"]);
    expect((await inc("OLD").get()).exists).toBe(false);
    expect((await inc("OLD").collection("events").get()).size).toBe(0);
    for (const p of [`clips/OLD/${"a".repeat(64)}.mp4`, `photos/OLD/${"b".repeat(64)}.jpg`, "packs/OLD/T1/v1.bundle"]) expect(await exists(p)).toBe(false);
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

  it("leaves a drill in place when its media cannot be deleted, so the next run tries again", async () => {
    await drill("OLD", closed(31));
    const failing = { getFiles: async () => { throw new Error("storage down"); } };
    const r = await deleteEndedDrills(admin.db, failing, admin.auth, NOW);
    expect(r.deleted).toEqual([]);
    expect(r.failed).toEqual(["OLD"]);
    expect((await inc("OLD").get()).exists).toBe(true);
  });

  it("a dry run lists what it would delete and changes nothing", async () => {
    await drill("OLD", closed(31));
    const gone = await member("OLD");
    const r = await deleteEndedDrills(admin.db, bucket, admin.auth, NOW, { dryRun: true });
    expect(r.deleted).toEqual(["OLD"]);
    expect(r.users).toBe(1);
    expect((await inc("OLD").get()).exists).toBe(true);
    expect(await exists("packs/OLD/T1/v1.bundle")).toBe(true);
    expect(await userExists(gone)).toBe(true);
  });
});
