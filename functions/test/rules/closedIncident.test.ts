import { doc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { camSighting, clipReadingDoc, routeRecord } from "../fixtures";
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
  it("an open reading record is completed while the search is open, and cannot be completed or taken over after it ended", async () => {
    const SHA2 = "e".repeat(64);
    for (const s of [SHA, SHA2]) await admin.db.doc(`incidents/I1/clipReadings/${s}`).set({ ...clipReadingDoc("I1", s, F), createdAt: new Date() });
    const db = dbAs(F, familyClaims);
    const done = { reading: camSighting(), route: routeRecord() };
    await assertSucceeds(updateDoc(doc(db, `incidents/I1/clipReadings/${SHA}`), done));
    await admin.db.doc("incidents/I1").update({ status: "closed", closedReason: "suspended" });
    await assertFails(updateDoc(doc(db, `incidents/I1/clipReadings/${SHA2}`), done));
    await assertFails(setDoc(doc(db, `incidents/I1/clipReadings/${SHA2}`), clipReadingDoc("I1", SHA2, F)));
  });
  it("an incident with no status field counts as open, as the apps and Storage read it", async () => {
    await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill" });
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), `incidents/I1/clipReadings/${SHA}`), clipReadingDoc("I1", SHA, F)));
  });
});
