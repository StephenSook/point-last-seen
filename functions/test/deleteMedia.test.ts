// deleteIncidentMediaNow (callable, command only): removes an incident's clips, photos and their readings on
// request, for example when a family withdraws consent or a search closes.
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleDeleteMedia } from "../src/media";
import { callRaw, emulatorIdToken } from "./callable";
import { admin, adminApp, clearFirestore, closeClients } from "./helpers";

const bucket = getStorage(adminApp).bucket();
const put = (path: string) => bucket.file(path).save(Buffer.from(path), { contentType: "application/octet-stream" });
const exists = async (path: string) => (await bucket.file(path).exists())[0];
const CLIP = "a".repeat(64), PHOTO = "b".repeat(64);
const command = (inc = "I1") => ({ uid: "command-uid", token: { inc, role: "command" } });

beforeEach(async () => {
  await clearFirestore();
  const [files] = await bucket.getFiles();
  await Promise.all(files.map(f => f.delete()));
  for (const inc of ["I1", "I2"]) {
    await admin.db.doc(`incidents/${inc}`).set({ name: "Drill", mode: "drill", status: "open" });
    await put(`clips/${inc}/${CLIP}.mp4`);
    await put(`photos/${inc}/${PHOTO}.jpg`);
    await admin.db.doc(`incidents/${inc}/clipReadings/${CLIP}`).set({ sha256: CLIP });
    await admin.db.doc(`incidents/${inc}/photoReadings/${PHOTO}`).set({ sha256: PHOTO });
    await admin.db.doc(`incidents/${inc}/photoConsents/${PHOTO}`).set({ storagePath: `photos/${inc}/${PHOTO}.jpg` });
  }
});
afterAll(closeClients);

describe("deleteIncidentMediaNow", () => {
  it("command removes its incident's clips, photos and their readings, and nothing of another incident", async () => {
    expect(await handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" })).toEqual({ deleted: 5 });
    expect((await admin.db.doc(`incidents/I1/photoConsents/${PHOTO}`).get()).exists).toBe(false);
    expect((await admin.db.doc(`incidents/I2/photoConsents/${PHOTO}`).get()).exists).toBe(true);
    expect(await exists(`clips/I1/${CLIP}.mp4`)).toBe(false);
    expect(await exists(`photos/I1/${PHOTO}.jpg`)).toBe(false);
    expect((await admin.db.doc(`incidents/I1/clipReadings/${CLIP}`).get()).exists).toBe(false);
    expect((await admin.db.doc(`incidents/I1/photoReadings/${PHOTO}`).get()).exists).toBe(false);
    expect(await exists(`clips/I2/${CLIP}.mp4`)).toBe(true);
    expect((await admin.db.doc(`incidents/I2/photoReadings/${PHOTO}`).get()).exists).toBe(true);
  });
  it("marks the incident revoked before removing any file, with a new time on every delete (review: every seat clears)", async () => {
    // A bucket stand-in that records whether the incident was already marked when the first file was listed.
    let markedBeforeListing: boolean | null = null;
    const watching = { getFiles: async (q: { prefix: string }) => {
      if (markedBeforeListing === null) markedBeforeListing = (await admin.db.doc("incidents/I1").get()).get("mediaRevokedAt") != null;
      return bucket.getFiles(q);
    } } as unknown as typeof bucket;
    await handleDeleteMedia(admin.db, watching, command(), { incidentId: "I1" });
    expect(markedBeforeListing).toBe(true);
    const first = (await admin.db.doc("incidents/I1").get()).get("mediaRevokedAt");
    expect(first).toBeInstanceOf(Timestamp);
    await new Promise(r => setTimeout(r, 5));
    await handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" });
    expect(((await admin.db.doc("incidents/I1").get()).get("mediaRevokedAt") as Timestamp).toMillis()).toBeGreaterThan(first.toMillis());
    expect((await admin.db.doc("incidents/I2").get()).get("mediaRevokedAt")).toBeUndefined();
  });
  it("each refusal carries a stable reason beside its sentence, so a client maps the code and reason, not the text", async () => {
    const reason = (e: unknown) => ({ code: (e as { code: string }).code, reason: (e as { details?: { reason?: string } }).details?.reason,
      message: (e as Error).message });
    const cases: [Promise<unknown>, string, string, string][] = [
      [handleDeleteMedia(admin.db, bucket, command(), { incidentId: "bad id" }), "invalid-argument", "bad_incident_id", "incidentId is malformed."],
      [handleDeleteMedia(admin.db, bucket, null, { incidentId: "I1" }), "unauthenticated", "not_signed_in", "Sign in before deleting an incident's media."],
      [handleDeleteMedia(admin.db, bucket, command("I2"), { incidentId: "I1" }), "permission-denied", "not_command", "Only the incident's command can delete its media."],
      [handleDeleteMedia(admin.db, bucket, command("NONE"), { incidentId: "NONE" }), "permission-denied", "not_command", "Only the incident's command can delete its media."],
    ];
    for (const [call, code, why, message] of cases) {
      expect(await call.then(() => null, reason)).toEqual({ code, reason: why, message });
    }
  });
  it("a refused caller marks nothing", async () => {
    await expect(handleDeleteMedia(admin.db, bucket, command("I2"), { incidentId: "I1" })).rejects.toMatchObject({ code: "permission-denied" });
    expect((await admin.db.doc("incidents/I1").get()).get("mediaRevokedAt")).toBeUndefined();
  });
  it("searchers, family, another incident's command and a signed-out caller are refused, and nothing is deleted", async () => {
    for (const auth of [{ uid: "s", token: { inc: "I1", role: "searcher" } }, { uid: "f", token: { inc: "I1", role: "family" } }, command("I2")]) {
      await expect(handleDeleteMedia(admin.db, bucket, auth, { incidentId: "I1" })).rejects.toMatchObject({ code: "permission-denied" });
    }
    await expect(handleDeleteMedia(admin.db, bucket, null, { incidentId: "I1" })).rejects.toMatchObject({ code: "unauthenticated" });
    expect(await exists(`clips/I1/${CLIP}.mp4`)).toBe(true);
  });
  it("like the security rules, a sandbox still being set up, or one with no timestamp expiry, refuses its command", async () => {
    const live = { name: "Live sandbox", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3_600_000) };
    await admin.db.doc("incidents/I1").set({ ...live, setupReady: false });
    await expect(handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" })).rejects.toMatchObject({ code: "permission-denied" });
    await admin.db.doc("incidents/I1").set({ name: "No expiry", mode: "judge", status: "open" });
    await expect(handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" })).rejects.toMatchObject({ code: "permission-denied" });
    await admin.db.doc("incidents/I1").set({ ...live, setupReady: true });
    await expect(handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" })).resolves.toMatchObject({ deleted: expect.any(Number) });
  });
  it("like the security rules, a missing or ended incident refuses even its command (review: stale claims)", async () => {
    await admin.db.doc("incidents/I1").set({ name: "Ended sandbox", mode: "judge", status: "open", expiresAt: new Date(Date.now() - 60_000) });
    await expect(handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(handleDeleteMedia(admin.db, bucket, command("I7"), { incidentId: "I7" })).rejects.toMatchObject({ code: "permission-denied" });
    expect(await exists(`clips/I1/${CLIP}.mp4`)).toBe(true);
    await admin.db.doc("incidents/I1").set({ name: "Live sandbox", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3_600_000) });
    // Two files, two readings and the photo's consent record.
    expect((await handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" })).deleted).toBe(5);
  });
  it("a malformed incident id is refused before anything is listed", async () => {
    for (const data of [{ incidentId: "../I1" }, { incidentId: "" }, {}, null]) {
      await expect(handleDeleteMedia(admin.db, bucket, command("../I1"), data as never)).rejects.toMatchObject({ code: "invalid-argument" });
    }
  });
  it("the exported callable refuses a signed-in request with no or a bad App Check token, and deletes nothing", async () => {
    const { deleteIncidentMediaNow } = await import("../src/index");
    const { idToken } = await emulatorIdToken();
    for (const appCheck of [undefined, "not-an-app-check-token"]) {
      const res = await callRaw({ method: "POST", idToken, appCheck, fn: deleteIncidentMediaNow, body: { data: { incidentId: "I1" } } });
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).toContain('"message":"Unauthenticated"');
    }
    expect(await exists(`clips/I1/${CLIP}.mp4`)).toBe(true);
    const ep = (deleteIncidentMediaNow as unknown as { __endpoint: { maxInstances?: number; region?: string[] } }).__endpoint;
    expect(ep.maxInstances).toBe(5);
    expect(ep.region).toEqual(["us-central1"]);
  });
});
