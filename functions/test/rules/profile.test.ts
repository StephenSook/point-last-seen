import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { allFlags, camSighting, clipReadingDoc, routeRecord, sharedProfile } from "../fixtures";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const S = "searcher-uid", C = "command-uid", F = "family-uid";

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I1/profile/shared").set(sharedProfile());
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
      await assertSucceeds(setDoc(doc(db, "incidents/I1/profile/shared"), sharedProfile()));
      await assertSucceeds(setDoc(doc(db, "incidents/I1/profile/command"), { nearbyWater: "creek" }));
    }
  });
  it("profile/shared takes only the shared fields, so private history can never land in a searcher-readable doc", async () => {
    const db = dbAs(F, familyClaims);
    await assertSucceeds(setDoc(doc(db, "incidents/I1/profile/shared"), sharedProfile({
      flags: allFlags(["mayNotRespond", "likelyToHide"]), approachNoteIds: ["may_not_respond"],
    })));
    for (const leak of [{ previousAddresses: [] }, { placesFrequented: [] }, { pastWandering: [] }, { vehicle: null },
                        { nearbyWater: "creek" }, { medications: "x" }, { flags: { notAFlag: true } }, { flags: { likelyToHide: "yes" } },
                        { appearance: "x".repeat(201) }]) {
      await assertFails(setDoc(doc(db, "incidents/I1/profile/shared"), leak, { merge: true }));
    }
  });
  it("profile/shared may carry up to five other names she may answer to, each 1 to 60 characters (field expert)", async () => {
    const db = dbAs(F, familyClaims);
    const put = (over: Record<string, unknown>) => setDoc(doc(db, "incidents/I1/profile/shared"), sharedProfile(over));
    await assertSucceeds(put({}));
    await assertSucceeds(put({ nickname: "", otherNames: [] }));
    await assertSucceeds(put({ nickname: "Mom", otherNames: ["Mom", "Margaret", "Peggy", "Mrs. Lee", "x".repeat(60)] }));
    for (const otherNames of [["a", "b", "c", "d", "e", "f"], [""], ["x".repeat(61)], ["Peggy", 7], "Peggy", { 0: "Peggy" }, null]) {
      await assertFails(put({ otherNames }));
    }
  });
  it("with the list present, nickname mirrors its first name, or is empty for an empty list (review)", async () => {
    const db = dbAs(F, familyClaims);
    const put = (over: Record<string, unknown>) => setDoc(doc(db, "incidents/I1/profile/shared"), sharedProfile(over));
    await assertSucceeds(put({ nickname: "Mom", otherNames: ["Mom", "Peggy"] }));
    await assertFails(put({ nickname: "Peggy", otherNames: ["Mom"] }));
    await assertFails(put({ nickname: "Peggy", otherNames: [] }));
    await assertSucceeds(put({ nickname: "Peggy" }));
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
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), `incidents/I1/clipReadings/${sha}`), clipReadingDoc("I1", sha, F)));
    await assertSucceeds(getDoc(doc(dbAs(S, searcherClaims), `incidents/I1/clipReadings/${sha}`)));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/clipReadings/${"d".repeat(64)}`), clipReadingDoc("I1", "d".repeat(64), S)));
  });
  it("a clip reading is created before upload with the three required consents and no reading yet (ruling I9)", async () => {
    const db = dbAs(F, familyClaims);
    const sha = "c".repeat(64);
    const path = `incidents/I1/clipReadings/${sha}`;
    const base = clipReadingDoc("I1", sha, F);
    const consent = base.consent as Record<string, unknown>;
    for (const bad of [
      { ...base, consent: { ...consent, cloudProcessing: null } }, { ...base, consent: { ...consent, personInClip: null } },
      { ...base, reading: { personVisible: true } }, { ...base, createdByUid: "someone-else" },
      { ...base, sha256: "b".repeat(64) }, { ...base, storagePath: "clips/I2/x.mp4" }, { ...base, extra: 1 },
    ]) await assertFails(setDoc(doc(db, path), bad));
    await assertSucceeds(setDoc(doc(db, path), base));
  });
  it("only its creator adds the reading, once, without touching the consents", async () => {
    const sha = "c".repeat(64);
    const path = `incidents/I1/clipReadings/${sha}`;
    await setDoc(doc(dbAs(F, familyClaims), path), clipReadingDoc("I1", sha, F));
    const reading = camSighting();
    await assertFails(setDoc(doc(dbAs(C, commandClaims), path), { reading, route: routeRecord() }, { merge: true }));
    await assertFails(setDoc(doc(dbAs(F, familyClaims), path), { reading, consent: { personInClip: null } }, { merge: true }));
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), path), { reading, route: routeRecord() }, { merge: true }));
    await assertFails(setDoc(doc(dbAs(F, familyClaims), path), { reading: camSighting({ personVisible: false }) }, { merge: true }));
  });
  it("its creator renews the consent while no reading exists, inside the expiry window only (review round 3)", async () => {
    const sha = "b".repeat(64), path = `incidents/I1/clipReadings/${sha}`;
    await admin.db.doc(path).set(clipReadingDoc("I1", sha, F, { expiresAt: new Date(Date.now() + 30 * 86400_000), createdAt: new Date(Date.now() - 2 * 86400_000) }));
    const renew = (uid: string, claims: object, over: Record<string, unknown> = {}) =>
      setDoc(doc(dbAs(uid, claims), path), clipReadingDoc("I1", sha, uid, over));
    await assertFails(renew(F, familyClaims, { expiresAt: new Date(Date.now() + 40 * 86400_000) }));
    await assertFails(renew(F, familyClaims, { storagePath: `clips/I2/${sha}.mp4` }));
    await assertFails(renew(F, familyClaims, { createdAt: new Date() }));
    await assertSucceeds(renew(F, familyClaims));
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), path), { reading: camSighting(), route: routeRecord() }, { merge: true }));
    await assertFails(renew(F, familyClaims));
  });
  it("a reading must be a valid sighting or a typed no-sighting result, with a valid route (review: could-not-read)", async () => {
    const sha = "9".repeat(64), path = `incidents/I1/clipReadings/${sha}`;
    await setDoc(doc(dbAs(F, familyClaims), path), clipReadingDoc("I1", sha, F));
    const complete = (reading: unknown, route: unknown = routeRecord()) =>
      setDoc(doc(dbAs(F, familyClaims), path), { reading, route }, { merge: true });
    for (const bad of [{ foo: 1 }, { status: "no_sighting", reasons: ["made_up"] }, { status: "other", reasons: ["no_person"] },
                       { status: "no_sighting", reasons: [] }, { status: "no_sighting", reasons: ["no_person"], extra: 1 }]) {
      await assertFails(complete(bad));
    }
    await assertFails(complete(camSighting(), { path: "cloud" }));
    await assertSucceeds(complete({ status: "no_sighting", reasons: ["no_person", "box"] }));
    await assertFails(complete(camSighting()));
  });
  it("any command or family member takes over a stalled record (reading null) with their own consent (review: could-not-read)", async () => {
    const F2 = "family-2", sha = "8".repeat(64), path = `incidents/I1/clipReadings/${sha}`;
    await admin.db.doc(path).set(clipReadingDoc("I1", sha, F, { createdAt: new Date(Date.now() - 2 * 86400_000) }));
    const take = (uid: string, claims: object, over: Record<string, unknown> = {}) =>
      setDoc(doc(dbAs(uid, claims), path), clipReadingDoc("I1", sha, uid, over));
    await assertFails(take(F2, { inc: "I2", role: "family", team: null }));
    await assertFails(take(F2, familyClaims, { createdByUid: F }));
    await assertFails(take(S, searcherClaims));
    await assertSucceeds(take(F2, familyClaims));
    await assertSucceeds(take(C, commandClaims));
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), path), { reading: { status: "no_sighting", reasons: ["no_person"] }, route: routeRecord() }, { merge: true }));
    await assertFails(take(F2, familyClaims));
  });
  it("photo readings are command only, read and write", async () => {
    const sha = "e".repeat(64);
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), `incidents/I1/photoReadings/${sha}`), { sha256: sha }));
    await assertFails(getDoc(doc(dbAs(S, searcherClaims), `incidents/I1/photoReadings/${sha}`)));
    await assertFails(getDoc(doc(dbAs(F, familyClaims), `incidents/I1/photoReadings/${sha}`)));
  });
});
