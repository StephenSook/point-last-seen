import { doc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { clipReadingDoc } from "../fixtures";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, dbAs, familyClaims } from "../helpers";

const F = "family-uid";
const SHA = "c".repeat(64);

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("a closed incident takes no new clip readings", () => {
  it("a family member starts a clip reading while the search is open, not after it ended", async () => {
    const db = dbAs(F, familyClaims);
    await assertSucceeds(setDoc(doc(db, `incidents/I1/clipReadings/${SHA}`), clipReadingDoc("I1", SHA, F)));
    await admin.db.doc("incidents/I1").update({ status: "closed", closedReason: "found" });
    const other = "d".repeat(64);
    await assertFails(setDoc(doc(db, `incidents/I1/clipReadings/${other}`), clipReadingDoc("I1", other, F)));
  });
  it("an open reading record cannot be completed or taken over after the search ended", async () => {
    await admin.db.doc(`incidents/I1/clipReadings/${SHA}`).set({ ...clipReadingDoc("I1", SHA, F), createdAt: new Date() });
    await admin.db.doc("incidents/I1").update({ status: "closed", closedReason: "suspended" });
    const db = dbAs(F, familyClaims);
    await assertFails(updateDoc(doc(db, `incidents/I1/clipReadings/${SHA}`), { reading: { kind: "no_sighting", why: "nobody_in_view" }, route: null }));
    await assertFails(setDoc(doc(db, `incidents/I1/clipReadings/${SHA}`), clipReadingDoc("I1", SHA, F)));
  });
});
