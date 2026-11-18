import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { getMetadata, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeEach, describe, it } from "vitest";
import { clipReadingDoc } from "../fixtures";
import { admin, adminApp, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, familyClaims, searcherClaims, storageAs } from "../helpers";

const SHA = "a".repeat(64);
const bytes = (n: number) => new Uint8Array(n);

beforeEach(async () => {
  await clearFirestore();
  await getAdminStorage(adminApp).bucket().deleteFiles({ force: true });
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  // Ruling I9: the clip reading with its consent record exists before the upload.
  await admin.db.doc(`incidents/I1/clipReadings/${SHA}`).set(clipReadingDoc("I1", SHA, "family-uid", { createdAt: new Date() }));
  await admin.db.doc(`incidents/J1/clipReadings/${SHA}`).set(clipReadingDoc("J1", SHA, "family-uid", { createdAt: new Date() }));
});
afterAll(closeClients);

describe("storage rules (spec section 7)", () => {
  it("a 15,000,000-byte clip upload is denied; a 13,000,000-byte one is allowed", async () => {
    const st = storageAs("family-uid", familyClaims);
    await assertFails(uploadBytes(ref(st, `clips/I1/${SHA}.mp4`), bytes(15_000_000), { contentType: "video/mp4" }));
    await assertSucceeds(uploadBytes(ref(st, `clips/I1/${SHA}.mp4`), bytes(13_000_000), { contentType: "video/mp4" }));
  });
  it("a clip must be video and land under the member's own incident", async () => {
    const st = storageAs("family-uid", familyClaims);
    await assertFails(uploadBytes(ref(st, `clips/I1/${SHA}.mp4`), bytes(1000), { contentType: "text/plain" }));
    await assertFails(uploadBytes(ref(st, `clips/I2/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
    await assertFails(uploadBytes(ref(storageAs(null), `clips/I1/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
  });
  it("photos are JPEG of at most 2 MB, written by command or family", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("command-uid", commandClaims), `photos/I1/${SHA}.jpg`), bytes(1_500_000), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(storageAs("command-uid", commandClaims), `photos/I1/${SHA}.jpg`), bytes(2_500_000), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(storageAs("searcher-uid", searcherClaims), `photos/I1/${SHA}.jpg`), bytes(1000), { contentType: "image/jpeg" }));
  });
  it("an expired judge sandbox takes no uploads (storage reads the incident from Firestore)", async () => {
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() - 60_000) });
    await assertFails(uploadBytes(ref(storageAs("family-uid", { inc: "J1", role: "family", team: null }), `clips/J1/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
  });
  it("a judge sandbox without a timestamp expiry takes no uploads; an unexpired one does", async () => {
    const fam = storageAs("family-uid", { inc: "J1", role: "family", team: null });
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open" });
    await assertFails(uploadBytes(ref(fam, `clips/J1/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
    await admin.db.doc("incidents/J1").set({ name: "Judge", mode: "judge", status: "open", expiresAt: new Date(Date.now() + 3600_000) });
    await assertSucceeds(uploadBytes(ref(fam, `clips/J1/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
  });
  it("media are create-only: an existing clip or photo cannot be replaced at its hash path", async () => {
    const fam = storageAs("family-uid", familyClaims);
    await assertSucceeds(uploadBytes(ref(fam, `clips/I1/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
    await assertFails(uploadBytes(ref(fam, `clips/I1/${SHA}.mp4`), bytes(2000), { contentType: "video/mp4" }));
    await assertSucceeds(uploadBytes(ref(fam, `photos/I1/${SHA}.jpg`), bytes(1000), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(fam, `photos/I1/${SHA}.jpg`), bytes(2000), { contentType: "image/jpeg" }));
  });
  it("media file names must be a lowercase sha256 with the right extension", async () => {
    const fam = storageAs("family-uid", familyClaims);
    for (const name of ["clip.mp4", `${"A".repeat(64)}.mp4`, `${SHA}.mov`, `${SHA.slice(1)}.mp4`]) {
      await assertFails(uploadBytes(ref(fam, `clips/I1/${name}`), bytes(1000), { contentType: "video/mp4" }));
    }
    await assertFails(uploadBytes(ref(fam, `photos/I1/${SHA}.png`), bytes(1000), { contentType: "image/jpeg" }));
  });
  it("a clip upload needs the uploader's own clip reading with consents first (ruling I9)", async () => {
    const fam = storageAs("family-uid", familyClaims);
    const other = "b".repeat(64);
    await assertFails(uploadBytes(ref(fam, `clips/I1/${other}.mp4`), bytes(1000), { contentType: "video/mp4" }));
    await admin.db.doc(`incidents/I1/clipReadings/${other}`).set(clipReadingDoc("I1", other, "command-uid", { createdAt: new Date() }));
    await assertFails(uploadBytes(ref(fam, `clips/I1/${other}.mp4`), bytes(1000), { contentType: "video/mp4" }));
    const third = "d".repeat(64);
    await admin.db.doc(`incidents/I1/clipReadings/${third}`).set(clipReadingDoc("I1", third, "family-uid", { createdAt: new Date() }));
    await assertSucceeds(uploadBytes(ref(fam, `clips/I1/${third}.mp4`), bytes(1000), { contentType: "video/mp4" }));
  });
  it("a clip upload needs a fresh consent: its clip reading must be under 24 hours old (review round 2)", async () => {
    // The consent record expires 31 to 33 days after it is written and the clip 30 days after upload, so an
    // upload within a day of the consent can never outlive it.
    const fam = storageAs("family-uid", familyClaims);
    const stale = "e".repeat(64), fresh = "f".repeat(64);
    await admin.db.doc(`incidents/I1/clipReadings/${stale}`).set(clipReadingDoc("I1", stale, "family-uid", { createdAt: new Date(Date.now() - 25 * 3_600_000) }));
    await assertFails(uploadBytes(ref(fam, `clips/I1/${stale}.mp4`), bytes(1000), { contentType: "video/mp4" }));
    await admin.db.doc(`incidents/I1/clipReadings/${fresh}`).set(clipReadingDoc("I1", fresh, "family-uid", { createdAt: new Date(Date.now() - 23 * 3_600_000) }));
    await assertSucceeds(uploadBytes(ref(fam, `clips/I1/${fresh}.mp4`), bytes(1000), { contentType: "video/mp4" }));
  });
  it("no client writes packs", async () => {
    await assertFails(uploadBytes(ref(storageAs("command-uid", commandClaims), "packs/I1/T1/v1.bundle"), bytes(10), { contentType: "application/octet-stream" }));
  });
  it("a pack bundle is readable by command and its own team only", async () => {
    const bucket = getAdminStorage(adminApp).bucket();
    await bucket.file("packs/I1/T1/v1.bundle").save(Buffer.from("bundle"), { contentType: "application/octet-stream" });
    await bucket.file("packs/I1/T2/v1.bundle").save(Buffer.from("bundle"), { contentType: "application/octet-stream" });
    await assertSucceeds(getMetadata(ref(storageAs("searcher-uid", searcherClaims), "packs/I1/T1/v1.bundle")));
    await assertFails(getMetadata(ref(storageAs("searcher-uid", searcherClaims), "packs/I1/T2/v1.bundle")));
    await assertSucceeds(getMetadata(ref(storageAs("command-uid", commandClaims), "packs/I1/T2/v1.bundle")));
  });
});
