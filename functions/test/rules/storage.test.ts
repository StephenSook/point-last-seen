import { ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, familyClaims, searcherClaims, storageAs } from "../helpers";

const SHA = "a".repeat(64);
const bytes = (n: number) => new Uint8Array(n);

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
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
  it("no client writes packs", async () => {
    await assertFails(uploadBytes(ref(storageAs("command-uid", commandClaims), "packs/I1/T1-v1.bundle"), bytes(10), { contentType: "application/octet-stream" }));
  });
});
