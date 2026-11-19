// A photo's cloud-read consent: incidents/{id}/photoConsents/{sha256}, written by the family member who shares the
// photo, read by command before any cloud read of it (getDocFromServer), never changed, withdrawn by its creator.
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const F = "family-uid", F2 = "other-family-uid", C = "command-uid", S = "searcher-uid";
const SHA = "b".repeat(64);
const consent = (uid: string, over: Record<string, unknown> = {}) => ({ storagePath: `photos/I1/${SHA}.jpg`,
  cloudProcessing: { byUid: uid, atMs: 1795860000000 }, createdByUid: uid, createdAt: serverTimestamp(), ...over });
const path = (sha = SHA) => `incidents/I1/photoConsents/${sha}`;

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("photo consents", () => {
  it("the family member sharing the photo records consent for it; command and family read it; a searcher cannot", async () => {
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), path()), consent(F)));
    await assertSucceeds(getDoc(doc(dbAs(C, commandClaims), path())));
    await assertSucceeds(getDoc(doc(dbAs(F2, familyClaims), path())));
    await assertFails(getDoc(doc(dbAs(S, searcherClaims), path())));
  });
  it("only family creates one, for themselves, for exactly this photo's path, at server time, with exactly its fields", async () => {
    await assertFails(setDoc(doc(dbAs(C, commandClaims), path()), consent(C)));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), path()), consent(S)));
    const db = dbAs(F, familyClaims);
    for (const over of [{ storagePath: `photos/I2/${SHA}.jpg` }, { storagePath: `photos/I1/${"c".repeat(64)}.jpg` }, { storagePath: `clips/I1/${SHA}.mp4` },
      { cloudProcessing: { byUid: F2, atMs: 1795860000000 } }, { cloudProcessing: { byUid: F, atMs: "now" } }, { cloudProcessing: { byUid: F } },
      { createdByUid: F2 }, { createdAt: new Date(2026, 0, 1) }, { extra: true }]) {
      await assertFails(setDoc(doc(db, path()), consent(F, over)));
    }
    await assertFails(setDoc(doc(db, path("NOT-A-HASH")), consent(F, { storagePath: "photos/I1/NOT-A-HASH.jpg" })));
  });
  it("is never changed; only its creator withdraws it", async () => {
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), path()), consent(F)));
    await assertFails(updateDoc(doc(dbAs(F, familyClaims), path()), { cloudProcessing: { byUid: F, atMs: 1 } }));
    await assertFails(setDoc(doc(dbAs(F, familyClaims), path()), consent(F)));
    await assertFails(deleteDoc(doc(dbAs(F2, familyClaims), path())));
    await assertFails(deleteDoc(doc(dbAs(C, commandClaims), path())));
    await assertSucceeds(deleteDoc(doc(dbAs(F, familyClaims), path())));
  });
});
