// A photo's cloud-read consent lives no longer than the photo: when the Storage object goes, by command, by the
// media delete or by the 30-day lifecycle, its consent goes too, so a re-upload of the same bytes needs a new one.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deletePhotoConsentForObject } from "../src/media";
import { admin, clearFirestore, closeClients } from "./helpers";

const SHA = "b".repeat(64);
const consent = (inc: string) => admin.db.doc(`incidents/${inc}/photoConsents/${SHA}`);

beforeEach(async () => {
  await clearFirestore();
  for (const inc of ["I1", "I2"]) await consent(inc).set({ storagePath: `photos/${inc}/${SHA}.jpg`, createdByUid: "f" });
});
afterAll(closeClients);

describe("deletePhotoConsentForObject", () => {
  it("deletes the consent of the photo that was deleted, and nothing else", async () => {
    expect(await deletePhotoConsentForObject(admin.db, `photos/I1/${SHA}.jpg`)).toBe(`incidents/I1/photoConsents/${SHA}`);
    expect((await consent("I1").get()).exists).toBe(false);
    expect((await consent("I2").get()).exists).toBe(true);
  });
  it("ignores every other object: clips, packs, malformed names and nested paths", async () => {
    for (const name of [`clips/I1/${SHA}.mp4`, `packs/I1/T1.json`, `photos/I1/${SHA}.png`, `photos/I1/NOTAHASH.jpg`, `photos/I1/x/${SHA}.jpg`, `photos/${SHA}.jpg`]) {
      expect(await deletePhotoConsentForObject(admin.db, name)).toBeNull();
    }
    expect((await consent("I1").get()).exists).toBe(true);
  });
  it("is registered on Storage object deletion", async () => {
    const { deletePhotoConsentOnPhotoDelete } = await import("../src/index");
    const ep = (deletePhotoConsentOnPhotoDelete as unknown as { __endpoint: { eventTrigger?: { eventType: string } } }).__endpoint;
    expect(ep.eventTrigger?.eventType).toBe("google.cloud.storage.object.v1.deleted");
  });
});
