// deleteIncidentMediaNow (callable, command only): removes an incident's clips, photos and their readings on
// request, for example when a family withdraws consent or a search closes.
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
  }
});
afterAll(closeClients);

describe("deleteIncidentMediaNow", () => {
  it("command removes its incident's clips, photos and their readings, and nothing of another incident", async () => {
    expect(await handleDeleteMedia(admin.db, bucket, command(), { incidentId: "I1" })).toEqual({ deleted: 4 });
    expect(await exists(`clips/I1/${CLIP}.mp4`)).toBe(false);
    expect(await exists(`photos/I1/${PHOTO}.jpg`)).toBe(false);
    expect((await admin.db.doc(`incidents/I1/clipReadings/${CLIP}`).get()).exists).toBe(false);
    expect((await admin.db.doc(`incidents/I1/photoReadings/${PHOTO}`).get()).exists).toBe(false);
    expect(await exists(`clips/I2/${CLIP}.mp4`)).toBe(true);
    expect((await admin.db.doc(`incidents/I2/photoReadings/${PHOTO}`).get()).exists).toBe(true);
  });
  it("searchers, family, another incident's command and a signed-out caller are refused, and nothing is deleted", async () => {
    for (const auth of [{ uid: "s", token: { inc: "I1", role: "searcher" } }, { uid: "f", token: { inc: "I1", role: "family" } }, command("I2")]) {
      await expect(handleDeleteMedia(admin.db, bucket, auth, { incidentId: "I1" })).rejects.toMatchObject({ code: "permission-denied" });
    }
    await expect(handleDeleteMedia(admin.db, bucket, null, { incidentId: "I1" })).rejects.toMatchObject({ code: "unauthenticated" });
    expect(await exists(`clips/I1/${CLIP}.mp4`)).toBe(true);
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
