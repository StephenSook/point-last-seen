import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const S = "searcher-uid", C = "command-uid", F = "family-uid", S2 = "searcher-2";
const ID = "c".repeat(32), ID2 = "d".repeat(32), EVENT = "e".repeat(32);
const report = (uid: string, role: string, over: Record<string, unknown> = {}) => ({
  authorUid: uid, role, target: "event", targetId: EVENT, reason: "abusive", note: "Unkind words in the note.", createdAt: serverTimestamp(), ...over,
});

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("content reports: a member flags shared content (App Review guideline 1.2)", () => {
  it("a searcher and a family member each file their own, for an event, the task or the family's description", async () => {
    await assertSucceeds(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/contentReports/${ID}`), report(S, "searcher")));
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), `incidents/I1/contentReports/${ID2}`),
      report(F, "family", { target: "family_description", targetId: null, reason: "personal_information" })));
    await assertSucceeds(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/contentReports/${"f".repeat(32)}`),
      (({ note: _n, ...r }) => r)(report(S, "searcher", { target: "task", targetId: "v3", reason: "wrong_or_misleading" }))));
  });

  it("refuses a report in someone else's name or role, a bad id, an unknown reason or target, or a client time", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S2, "searcher")));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "family")));
    await assertFails(setDoc(doc(db, "incidents/I1/contentReports/not-hex"), report(S, "searcher")));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { reason: "spam" })));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { target: "photo" })));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { createdAt: new Date() })));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { note: "x".repeat(501) })));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { extra: 1 })));
  });

  it("the target id fits the target: an event id for an event, none for the family's description", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { targetId: null })));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { targetId: "short" })));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { target: "family_description", targetId: EVENT })));
    await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${ID}`), report(S, "searcher", { target: "task", targetId: null })));
  });

  it("command does not file one; a non-member cannot", async () => {
    await assertFails(setDoc(doc(dbAs(C, commandClaims), `incidents/I1/contentReports/${ID}`), report(C, "command")));
    await assertFails(setDoc(doc(dbAs("x", { inc: "I2", role: "searcher", team: "T1" }), `incidents/I1/contentReports/${ID}`), report("x", "searcher")));
  });

  it("command reads every report; an author reads only its own; nobody updates or deletes one", async () => {
    await admin.db.doc(`incidents/I1/contentReports/${ID}`).set({ ...report(S, "searcher"), createdAt: new Date() });
    await assertSucceeds(getDoc(doc(dbAs(C, commandClaims), `incidents/I1/contentReports/${ID}`)));
    await assertSucceeds(getDoc(doc(dbAs(S, searcherClaims), `incidents/I1/contentReports/${ID}`)));
    await assertFails(getDoc(doc(dbAs(S2, searcherClaims), `incidents/I1/contentReports/${ID}`)));
    await assertFails(getDoc(doc(dbAs(F, familyClaims), `incidents/I1/contentReports/${ID}`)));
    await assertFails(updateDoc(doc(dbAs(S, searcherClaims), `incidents/I1/contentReports/${ID}`), { reason: "other" }));
    await assertFails(deleteDoc(doc(dbAs(S, searcherClaims), `incidents/I1/contentReports/${ID}`)));
    await assertFails(deleteDoc(doc(dbAs(C, commandClaims), `incidents/I1/contentReports/${ID}`)));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/contentReports/${ID}`), report(S, "searcher", { reason: "other" })));
  });
});
