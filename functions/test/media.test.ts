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
    expect(r).toEqual({ incidents: ["J1"], files: 3 });
    for (const p of [`clips/J1/${"a".repeat(64)}.mp4`, `photos/J1/${"b".repeat(64)}.jpg`, "packs/J1/T1/v1.bundle"]) expect(await exists(p)).toBe(false);
    expect((await admin.db.doc("incidents/J1").get()).get("mediaDeletedAt")).toBeInstanceOf(Timestamp);
  });
  it("leaves a live sandbox, drills (even one with an end time) and a look-alike prefix alone", async () => {
    await deleteEndedSandboxMedia(admin.db, bucket, NOW);
    for (const inc of ["J2", "D1", "D2"]) expect(await exists(`clips/${inc}/${"a".repeat(64)}.mp4`)).toBe(true);
    expect(await exists("clips/J10/keep.mp4")).toBe(true);
    expect((await admin.db.doc("incidents/J2").get()).get("mediaDeletedAt")).toBeUndefined();
  });
  it("runs again as a no-op, and a file added after the stamp is still deleted on the next run", async () => {
    await deleteEndedSandboxMedia(admin.db, bucket, NOW);
    expect(await deleteEndedSandboxMedia(admin.db, bucket, NOW + 900_000)).toEqual({ incidents: [], files: 0 });
    await put(`clips/J1/${"c".repeat(64)}.mp4`);
    expect(await deleteEndedSandboxMedia(admin.db, bucket, NOW + 1_800_000)).toEqual({ incidents: ["J1"], files: 1 });
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
  it("writes ops/storage with the lifecycle state and a server time", async () => {
    const fake = { getMetadata: async () => [{ lifecycle: { rule: [rule(30, ["clips/", "photos/", "packs/"])] } }] };
    await recordStorageHealth(admin.db, fake as never);
    const d = (await admin.db.doc("ops/storage").get()).data()!;
    expect(d.lifecycleOk).toBe(true);
    expect(d.lifecycleAgeDays).toBe(30);
    expect(d.checkedAt).toBeInstanceOf(Timestamp);
  });
});
