// deleteIncidentMedia: a judge sandbox's clips, photos and packs are deleted once it has ended, because a
// member can mint a no-sign-in download link that lives as long as the file (docs/LIMITS.md).
import { getStorage } from "firebase-admin/storage";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteClipForReading, deleteEndedSandboxMedia, deleteTrackForReading, lifecycleOk, recordStorageHealth, runMediaSweep } from "../src/media";
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
    expect(j1.mediaDeletedAt).toBeUndefined();
    expect(j1.mediaSweepEmpty).toBe(false);
    expect((await admin.db.doc("incidents/J3").get()).get("mediaDeletedAt")).toBeInstanceOf(Timestamp);
    // The next run, with the hold gone, deletes the clip and stamps the sandbox.
    expect((await deleteEndedSandboxMedia(admin.db, bucket, NOW + 300_000)).incidents).toEqual(["J1"]);
    expect(await exists(`clips/J1/${"a".repeat(64)}.mp4`)).toBe(false);
    expect((await admin.db.doc("incidents/J1").get()).get("mediaDeletedAt")).toBeInstanceOf(Timestamp);
  });
  it("sweeps every ended sandbox whose last sweep was not empty, however old, with or without a stamp (review round 3)", async () => {
    const old = Timestamp.fromMillis(NOW - 10 * 86_400_000);
    await admin.db.doc("incidents/J5").set({ name: "Old, stale stamp", mode: "judge", status: "open", expiresAt: old, mediaDeletedAt: old });
    await admin.db.doc("incidents/J6").set({ name: "Old, never stamped", mode: "judge", status: "open", expiresAt: old });
    await admin.db.doc("incidents/J7").set({ name: "Old, done", mode: "judge", status: "open", expiresAt: old, mediaDeletedAt: old, mediaSweepEmpty: true });
    for (const inc of ["J5", "J6", "J7"]) await put(`clips/${inc}/${"a".repeat(64)}.mp4`);
    await deleteEndedSandboxMedia(admin.db, bucket, NOW);
    expect(await exists(`clips/J5/${"a".repeat(64)}.mp4`)).toBe(false);
    expect(await exists(`clips/J6/${"a".repeat(64)}.mp4`)).toBe(false);
    expect(await exists(`clips/J7/${"a".repeat(64)}.mp4`)).toBe(true);
  });
  it("a sandbox whose Firestore write fails is reported and the next sandbox is still swept (review round 3)", async () => {
    await admin.db.doc("incidents/J3").set({ name: "Ended too", mode: "judge", status: "open", expiresAt: Timestamp.fromMillis(NOW - 120_000) });
    await put(`clips/J3/${"a".repeat(64)}.mp4`);
    // Removing J1's doc during its sweep makes the stamp update fail with NOT_FOUND.
    const vanishing = { getFiles: async (q: { prefix: string }) => {
      if (q.prefix === "packs/J1/") await admin.db.doc("incidents/J1").delete();
      return bucket.getFiles(q);
    } };
    const r = await deleteEndedSandboxMedia(admin.db, vanishing as never, NOW);
    expect(r.failed).toEqual(["J1"]);
    expect(await exists(`clips/J3/${"a".repeat(64)}.mp4`)).toBe(false);
  });
});

describe("runMediaSweep writes the heartbeat on every run (review round 3)", () => {
  const lc = { getMetadata: async () => [{ lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 30, matchesPrefix: ["clips/", "photos/", "packs/"] } }] } }] };
  it("records the failure count after a clean run", async () => {
    await runMediaSweep(admin.db, { getFiles: (q: { prefix: string }) => bucket.getFiles(q), ...lc } as never, NOW);
    const d = (await admin.db.doc("ops/storage").get()).data()!;
    expect(d.sweepFailures).toBe(0);
    expect(d.checkedAt).toBeInstanceOf(Timestamp);
  });
  it("still writes ops/storage, counting a failure, when the sweep itself throws, and then throws", async () => {
    const down = { collection: () => { throw new Error("firestore down"); }, doc: (path: string) => admin.db.doc(path) };
    await expect(runMediaSweep(down as never, lc as never, NOW)).rejects.toThrow("firestore down");
    const d = (await admin.db.doc("ops/storage").get()).data()!;
    expect(d.sweepFailures).toBe(1);
    expect(d.sweepFailureStreak).toBe(1);
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

describe("a deleted clip reading takes its clip with it (consent is the clip's lifetime)", () => {
  const sha = "c".repeat(64);
  it("deletes clips/<incident>/<sha>.mp4 and nothing else", async () => {
    await put(`clips/J1/${sha}.mp4`);
    await deleteClipForReading(bucket, "J1", sha);
    expect(await exists(`clips/J1/${sha}.mp4`)).toBe(false);
    expect(await exists(`clips/J1/${"a".repeat(64)}.mp4`)).toBe(true);
    expect(await exists(`photos/J1/${"b".repeat(64)}.jpg`)).toBe(true);
  });
  it("a reading whose clip never uploaded, or is already gone, is not an error", async () => {
    await expect(deleteClipForReading(bucket, "J1", "d".repeat(64))).resolves.toBe(false);
  });
  it("an id that is not a clip hash touches nothing", async () => {
    for (const bad of ["../../packs/J1/T1/v1", "C".repeat(64), "c".repeat(63)]) {
      await expect(deleteClipForReading(bucket, "J1", bad)).resolves.toBe(false);
    }
    expect(await exists("packs/J1/T1/v1.bundle")).toBe(true);
  });
  it("runs on every clip reading delete (TTL, command or sweep), with retry on", async () => {
    const { deleteClipOnConsentEnd } = await import("../src/index");
    const ep = (deleteClipOnConsentEnd as unknown as { __endpoint: { eventTrigger: { eventFilterPathPatterns: Record<string, string>; retry: boolean; eventType: string } } }).__endpoint.eventTrigger;
    expect(ep.eventType).toBe("google.cloud.firestore.document.v1.deleted");
    expect(ep.eventFilterPathPatterns.document).toBe("incidents/{incidentId}/clipReadings/{sha256}");
    expect(ep.retry).toBe(true);
  });
});

describe("a clip's track goes with its media and its reading", () => {
  const sha = "e".repeat(64);
  it("the sweep deletes an ended sandbox's tracks and leaves a live sandbox's and a drill's", async () => {
    for (const inc of ["J1", "J2", "D2"]) await admin.db.doc(`incidents/${inc}/clipTracks/${sha}`).set({ sha256: sha });
    await deleteEndedSandboxMedia(admin.db, bucket, NOW);
    expect((await admin.db.doc(`incidents/J1/clipTracks/${sha}`).get()).exists).toBe(false);
    expect((await admin.db.doc(`incidents/J2/clipTracks/${sha}`).get()).exists).toBe(true);
    expect((await admin.db.doc(`incidents/D2/clipTracks/${sha}`).get()).exists).toBe(true);
  });
  it("a deleted reading deletes the track of the same clip and nothing else", async () => {
    await admin.db.doc(`incidents/J1/clipTracks/${sha}`).set({ sha256: sha });
    await admin.db.doc(`incidents/J1/clipTracks/${"f".repeat(64)}`).set({ sha256: "f".repeat(64) });
    await expect(deleteTrackForReading(admin.db, "J1", sha)).resolves.toBe(true);
    expect((await admin.db.doc(`incidents/J1/clipTracks/${sha}`).get()).exists).toBe(false);
    expect((await admin.db.doc(`incidents/J1/clipTracks/${"f".repeat(64)}`).get()).exists).toBe(true);
    await expect(deleteTrackForReading(admin.db, "J1", sha)).resolves.toBe(false);
  });
  it("an id that is not a clip hash, or a bad incident id, touches nothing", async () => {
    await admin.db.doc(`incidents/J1/clipTracks/${sha}`).set({ sha256: sha });
    for (const [inc, bad] of [["J1", "E".repeat(64)], ["J1", "e".repeat(63)], ["../J1", sha]] as const) await expect(deleteTrackForReading(admin.db, inc, bad)).resolves.toBe(false);
    expect((await admin.db.doc(`incidents/J1/clipTracks/${sha}`).get()).exists).toBe(true);
  });
});
