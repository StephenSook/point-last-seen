// deleteIncidentMedia: a judge sandbox's clips, photos and packs are deleted once it has ended, because a
// member can mint a no-sign-in download link that lives as long as the file (docs/LIMITS.md).
import { getStorage } from "firebase-admin/storage";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteEndedSandboxMedia, lifecycleOk, recordStorageHealth } from "../src/media";
import { admin, adminApp, clearFirestore, closeClients } from "./helpers";

const bucket = getStorage(adminApp).bucket();
const NOW = Date.UTC(2026, 11, 12, 15, 0);
const put = (path: string) => bucket.file(path).save(Buffer.from(path), { contentType: "application/octet-stream" });
const exists = async (path: string) => (await bucket.file(path).exists())[0];

beforeEach(async () => {
  await clearFirestore();
  const [files] = await bucket.getFiles();
  await Promise.all(files.map(f => f.delete()));
  await admin.db.doc("incidents/J1").set({ name: "Ended sandbox", mode: "judge", status: "open", expiresAt: Timestamp.fromMillis(NOW - 60_000) });
  await admin.db.doc("incidents/J2").set({ name: "Live sandbox", mode: "judge", status: "open", expiresAt: Timestamp.fromMillis(NOW + 3_600_000) });
  await admin.db.doc("incidents/D1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/D2").set({ name: "Drill with an end", mode: "drill", status: "open", expiresAt: Timestamp.fromMillis(NOW - 60_000) });
  for (const inc of ["J1", "J2", "D1", "D2"]) {
    await put(`clips/${inc}/${"a".repeat(64)}.mp4`);
    await put(`photos/${inc}/${"b".repeat(64)}.jpg`);
    await put(`packs/${inc}/T1/v1.bundle`);
  }
  await put("clips/J10/keep.mp4");
});
afterAll(closeClients);

describe("deleteIncidentMedia", () => {
  it("deletes an ended judge sandbox's clips, photos and packs and stamps mediaDeletedAt", async () => {
    const r = await deleteEndedSandboxMedia(admin.db, bucket, NOW);
    expect(r).toEqual({ incidents: ["J1"], files: 3, failed: [] });
    for (const p of [`clips/J1/${"a".repeat(64)}.mp4`, `photos/J1/${"b".repeat(64)}.jpg`, "packs/J1/T1/v1.bundle"]) expect(await exists(p)).toBe(false);
    expect((await admin.db.doc("incidents/J1").get()).get("mediaDeletedAt")).toBeInstanceOf(Timestamp);
  });
  it("leaves a live sandbox, drills (even one with an end time) and a look-alike prefix alone", async () => {
    await deleteEndedSandboxMedia(admin.db, bucket, NOW);
    for (const inc of ["J2", "D1", "D2"]) expect(await exists(`clips/${inc}/${"a".repeat(64)}.mp4`)).toBe(true);
    expect(await exists("clips/J10/keep.mp4")).toBe(true);
    expect((await admin.db.doc("incidents/J2").get()).get("mediaDeletedAt")).toBeUndefined();
  });
  it("a file that lands after the first sweep goes on the next; once a sweep finds nothing, the sandbox is not listed again", async () => {
    await deleteEndedSandboxMedia(admin.db, bucket, NOW);
    await put(`clips/J1/${"c".repeat(64)}.mp4`);
    expect(await deleteEndedSandboxMedia(admin.db, bucket, NOW + 300_000)).toEqual({ incidents: ["J1"], files: 1, failed: [] });
    expect(await deleteEndedSandboxMedia(admin.db, bucket, NOW + 600_000)).toEqual({ incidents: [], files: 0, failed: [] });
    expect((await admin.db.doc("incidents/J1").get()).get("mediaSweepEmpty")).toBe(true);
    const listed: string[] = [];
    const spy = { getFiles: (q: { prefix: string }) => { listed.push(q.prefix); return bucket.getFiles(q); } };
    await deleteEndedSandboxMedia(admin.db, spy as never, NOW + 900_000);
    expect(listed.some(x => x.includes("/J1/"))).toBe(false);
  });
});

describe("deleteIncidentMedia keeps going and stays cheap (review rounds 1 and 2)", () => {
  it("a held clip does not stop that sandbox's photos and packs or the next sandbox; the sandbox is retried", async () => {
    await admin.db.doc("incidents/J3").set({ name: "Ended too", mode: "judge", status: "open", expiresAt: Timestamp.fromMillis(NOW - 120_000) });
    await put(`clips/J3/${"a".repeat(64)}.mp4`);
    const flaky = { getFiles: (q: { prefix: string }) => (q.prefix === "clips/J1/" ? Promise.reject(new Error("held")) : bucket.getFiles(q)) };
    const r = await deleteEndedSandboxMedia(admin.db, flaky as never, NOW);
    expect(r.failed).toEqual(["J1"]);
    expect(r.incidents).toEqual(["J1", "J3"]);
    expect(await exists(`photos/J1/${"b".repeat(64)}.jpg`)).toBe(false);
    expect(await exists("packs/J1/T1/v1.bundle")).toBe(false);
    expect(await exists(`clips/J1/${"a".repeat(64)}.mp4`)).toBe(true);
    expect(await exists(`clips/J3/${"a".repeat(64)}.mp4`)).toBe(false);
    const j1 = (await admin.db.doc("incidents/J1").get()).data()!;
    expect(j1.mediaDeletedAt).toBeNull();
    expect((await admin.db.doc("incidents/J3").get()).get("mediaDeletedAt")).toBeInstanceOf(Timestamp);
  });
  it("lists only sandboxes ended in the last 7 days or not yet stamped, not the whole history", async () => {
    const old = Timestamp.fromMillis(NOW - 10 * 86_400_000);
    await admin.db.doc("incidents/J5").set({ name: "Old, done", mode: "judge", status: "open", expiresAt: old, mediaDeletedAt: old });
    await admin.db.doc("incidents/J6").set({ name: "Old, failed", mode: "judge", status: "open", expiresAt: old, mediaDeletedAt: null });
    await put(`clips/J6/${"a".repeat(64)}.mp4`);
    const listed: string[] = [];
    const spy = { getFiles: (q: { prefix: string }) => { listed.push(q.prefix); return bucket.getFiles(q); } };
    await deleteEndedSandboxMedia(admin.db, spy as never, NOW);
    expect(listed.some(x => x.includes("/J5/"))).toBe(false);
    expect(listed.some(x => x.includes("/J6/"))).toBe(true);
    expect(await exists(`clips/J6/${"a".repeat(64)}.mp4`)).toBe(false);
  });
});

describe("storage health for the daily probe (ops/storage)", () => {
  const rule = (age: number, prefixes: string[]) => ({ action: { type: "Delete" }, condition: { age, matchesPrefix: prefixes } });
  it("the lifecycle check needs a Delete rule within 30 days covering clips/, photos/ and packs/", () => {
    expect(lifecycleOk({ lifecycle: { rule: [rule(30, ["clips/", "photos/", "packs/"])] } })).toEqual({ ok: true, ageDays: 30 });
    expect(lifecycleOk({ lifecycle: { rule: [rule(30, ["packs/", "clips/", "photos/"])] } }).ok).toBe(true);
    expect(lifecycleOk({ lifecycle: { rule: [rule(30, ["clips/", "photos/"])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [rule(60, ["clips/", "photos/", "packs/"])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [{ action: { type: "SetStorageClass" }, condition: { age: 1 } }] } }).ok).toBe(false);
    expect(lifecycleOk({})).toEqual({ ok: false, ageDays: null });
  });
  it("only the exact rule counts (Codex MP2 review M6): age 30, exactly the three prefixes, no other condition", () => {
    // A bucket-wide 7-day delete, an extra condition such as isLive, or a fourth prefix would read OK before.
    expect(lifecycleOk({ lifecycle: { rule: [rule(7, [])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [rule(7, ["clips/", "photos/", "packs/"])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [rule(30, ["clips/", "photos/", "packs/", "other/"])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 30, matchesPrefix: ["clips/", "photos/", "packs/"], isLive: false } }] } }).ok).toBe(false);
  });
  it("no other Delete rule may undercut it, and the prefixes are an exact set (review round 2)", () => {
    const ours = rule(30, ["clips/", "photos/", "packs/"]);
    expect(lifecycleOk({ lifecycle: { rule: [ours, rule(7, ["other/"])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [ours, rule(60, ["clips/"])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [ours, { action: { type: "Delete" }, condition: { age: 60 } }] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [rule(30, ["clips/", "clips/", "photos/", "packs/"])] } }).ok).toBe(false);
    expect(lifecycleOk({ lifecycle: { rule: [ours, { action: { type: "SetStorageClass" }, condition: { age: 1 } }] } }).ok).toBe(true);
    expect(lifecycleOk({ lifecycle: { rule: [ours, rule(90, ["other/"])] } }).ok).toBe(true);
  });
  it("writes ops/storage with the lifecycle state and a server time", async () => {
    const fake = { getMetadata: async () => [{ lifecycle: { rule: [rule(30, ["clips/", "photos/", "packs/"])] } }] };
    await recordStorageHealth(admin.db, fake as never, 2);
    await recordStorageHealth(admin.db, fake as never, 1);
    const d = (await admin.db.doc("ops/storage").get()).data()!;
    expect(d.sweepFailures).toBe(1);
    expect(d.sweepFailureStreak).toBe(2);
    await recordStorageHealth(admin.db, fake as never, 0);
    expect((await admin.db.doc("ops/storage").get()).get("sweepFailureStreak")).toBe(0);
    expect(d.lifecycleOk).toBe(true);
    expect(d.lifecycleAgeDays).toBe(30);
    expect(d.checkedAt).toBeInstanceOf(Timestamp);
  });
});

describe("deleteIncidentMedia schedule (Codex MP2 review M2)", () => {
  it("runs every 5 minutes, so a sandbox's media goes within 15 minutes of its end even with a late run", async () => {
    const { deleteIncidentMedia } = await import("../src/index");
    expect((deleteIncidentMedia as unknown as { __endpoint: { scheduleTrigger: { schedule: string } } }).__endpoint.scheduleTrigger.schedule)
      .toBe("every 5 minutes");
  });
});
