import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const S = "searcher-uid", C = "command-uid", F = "family-uid";

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I1/profile/shared").set({ answersTo: "Mom" });
  await admin.db.doc("incidents/I1/profile/command").set({ nearbyWater: "creek" });
});
afterAll(closeClients);

describe("subject profile split (spec section 13.2)", () => {
  it("a searcher reads profile/shared but not profile/command, and writes neither", async () => {
    const db = dbAs(S, searcherClaims);
    await assertSucceeds(getDoc(doc(db, "incidents/I1/profile/shared")));
    await assertFails(getDoc(doc(db, "incidents/I1/profile/command")));
    await assertFails(setDoc(doc(db, "incidents/I1/profile/command"), {}));
    await assertFails(setDoc(doc(db, "incidents/I1/profile/shared"), { answersTo: "x" }));
  });
  it("command and family read and write both profile documents", async () => {
    for (const [uid, claims] of [[C, commandClaims], [F, familyClaims]] as const) {
      const db = dbAs(uid, claims);
      await assertSucceeds(getDoc(doc(db, "incidents/I1/profile/shared")));
      await assertSucceeds(getDoc(doc(db, "incidents/I1/profile/command")));
      await assertSucceeds(setDoc(doc(db, "incidents/I1/profile/shared"), { answersTo: "Mom" }));
      await assertSucceeds(setDoc(doc(db, "incidents/I1/profile/command"), { nearbyWater: "creek" }));
    }
  });
  it("profile/shared takes only the shared fields, so private history can never land in a searcher-readable doc", async () => {
    const db = dbAs(F, familyClaims);
    await assertSucceeds(setDoc(doc(db, "incidents/I1/profile/shared"), {
      answersTo: "Mom", ageYears: 81, clothingLastWorn: "red coat", mobilityAids: ["cane"],
      flags: { mayNotRespond: true, likelyToHide: true }, approachNoteIds: ["may_not_respond"],
    }));
    for (const leak of [{ previousAddresses: [] }, { placesFrequented: [] }, { pastWandering: [] }, { vehicle: null },
                        { nearbyWater: "creek" }, { medications: "x" }, { flags: { notAFlag: true } }, { flags: { likelyToHide: "yes" } },
                        { appearance: "x".repeat(201) }]) {
      await assertFails(setDoc(doc(db, "incidents/I1/profile/shared"), leak, { merge: true }));
    }
  });
  it("profile/command takes only the command fields", async () => {
    const db = dbAs(C, commandClaims);
    await assertSucceeds(setDoc(doc(db, "incidents/I1/profile/command"), { nearbyWater: "creek", vehicle: null }));
    await assertFails(setDoc(doc(db, "incidents/I1/profile/command"), { medications: "x" }, { merge: true }));
    await assertFails(setDoc(doc(db, "incidents/I1/profile/command"), { answersTo: "Mom" }, { merge: true }));
  });
  it("no other profile document exists for clients", async () => {
    await assertFails(setDoc(doc(dbAs(C, commandClaims), "incidents/I1/profile/medical"), { x: 1 }));
  });
});

describe("clip and photo readings", () => {
  it("command and family write clip readings; members read them; searchers cannot write", async () => {
    const sha = "f".repeat(64);
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), `incidents/I1/clipReadings/${sha}`), { sha256: sha }));
    await assertSucceeds(getDoc(doc(dbAs(S, searcherClaims), `incidents/I1/clipReadings/${sha}`)));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/clipReadings/${sha}`), { sha256: sha }));
  });
  it("photo readings are command only, read and write", async () => {
    const sha = "e".repeat(64);
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), `incidents/I1/photoReadings/${sha}`), { sha256: sha }));
    await assertFails(getDoc(doc(dbAs(S, searcherClaims), `incidents/I1/photoReadings/${sha}`)));
    await assertFails(getDoc(doc(dbAs(F, familyClaims), `incidents/I1/photoReadings/${sha}`)));
  });
});
