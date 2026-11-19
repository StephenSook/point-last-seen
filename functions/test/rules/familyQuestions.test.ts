// The family channel: command asks the family a question (familyQuestions/{id}); the family answers it once; every
// member reads. The search state the family may be told is only "searching" or "paused" (never an outcome).
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const C = "command-uid", F = "family-uid", F2 = "other-family-uid", S = "searcher-uid";
// A Firestore auto-id (addDoc): 20 letters and digits, so nothing typed by a person can ride the push as an id.
const QID = "Ab3dEf6hIj9kLm2nOp5q";
const Q = (id = QID) => `incidents/I1/familyQuestions/${id}`;
const question = (uid: string, over: Record<string, unknown> = {}) => ({ text: "Does she have a favourite song?", createdByUid: uid, createdAt: serverTimestamp(), ...over });
const answer = (uid: string, over: Record<string, unknown> = {}) => ({ answer: "Moon River.", answeredByUid: uid, answeredAt: serverTimestamp(), ...over });

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open", priorVersion: 1 });
});
afterAll(closeClients);

describe("family questions", () => {
  it("command asks; every member reads it", async () => {
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), Q()), question(C)));
    for (const [uid, claims] of [[F, familyClaims], [S, searcherClaims]] as const) await assertSucceeds(getDoc(doc(dbAs(uid, claims), Q())));
  });
  it("only command asks, as itself, at server time, with exactly its fields and 1 to 280 characters", async () => {
    await assertFails(setDoc(doc(dbAs(F, familyClaims), Q()), question(F)));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), Q()), question(S)));
    const db = dbAs(C, commandClaims);
    for (const over of [{ text: "" }, { text: "x".repeat(281) }, { text: 7 }, { createdByUid: F }, { createdAt: new Date(2026, 0, 1) }, { extra: true }]) {
      await assertFails(setDoc(doc(db, Q()), question(C, over)));
    }
    for (const id of ["x".repeat(41), "bad id", "q1", "Ab3dEf6hIj9kLm2nOp5", "Ab3dEf6hIj9kLm2nOp5qR", "Ab3d-f6hIj9kLm2nOp5q", "Mrs_Jones_phone_5551"]) {
      await assertFails(setDoc(doc(db, Q(id)), question(C)));
    }
    await assertSucceeds(setDoc(doc(db, Q()), question(C, { text: "x".repeat(280) })));
  });
  it("command asks only while the incident is open: not once it is found or closed", async () => {
    for (const status of ["found", "closed"]) {
      await admin.db.doc("incidents/I1").update({ status });
      await assertFails(setDoc(doc(dbAs(C, commandClaims), Q()), question(C)));
    }
  });
  it("the family answers once, as itself, at server time, with 1 to 500 characters; nobody else answers", async () => {
    await admin.db.doc(Q()).set({ text: "Favourite song?", createdByUid: C, createdAt: new Date() });
    await assertFails(updateDoc(doc(dbAs(C, commandClaims), Q()), answer(C)));
    await assertFails(updateDoc(doc(dbAs(S, searcherClaims), Q()), answer(S)));
    const fam = dbAs(F, familyClaims);
    for (const over of [{ answer: "" }, { answer: "x".repeat(501) }, { answeredByUid: F2 }, { answeredAt: new Date(2026, 0, 1) }]) {
      await assertFails(updateDoc(doc(fam, Q()), answer(F, over)));
    }
    await assertFails(updateDoc(doc(fam, Q()), { ...answer(F), text: "changed" }));
    await assertSucceeds(updateDoc(doc(fam, Q()), answer(F)));
    await assertFails(updateDoc(doc(dbAs(F2, familyClaims), Q()), answer(F2, { answer: "Something else." })));
    await assertFails(updateDoc(doc(fam, Q()), answer(F, { answer: "Changed my mind." })));
  });
  it("nobody deletes a question", async () => {
    await admin.db.doc(Q()).set({ text: "Favourite song?", createdByUid: C, createdAt: new Date() });
    for (const [uid, claims] of [[C, commandClaims], [F, familyClaims]] as const) await assertFails(deleteDoc(doc(dbAs(uid, claims), Q())));
  });
});

describe("the search state the family may be told", () => {
  it("command sets searchState to searching or paused, and to nothing else", async () => {
    const db = dbAs(C, commandClaims);
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { searchState: "searching" }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { searchState: "paused" }));
    for (const v of ["found", "closed", "deceased", "", 1]) await assertFails(updateDoc(doc(db, "incidents/I1"), { searchState: v }));
    await assertFails(updateDoc(doc(dbAs(F, familyClaims), "incidents/I1"), { searchState: "paused" }));
  });
});

describe("the family push budget", () => {
  it("is server-only: no member reads or writes it", async () => {
    await admin.db.doc("incidents/I1/pushBudget/family-2026-11-21").set({ count: 3 });
    for (const [uid, claims] of [[C, commandClaims], [F, familyClaims], [S, searcherClaims]] as const) {
      const db = dbAs(uid, claims);
      await assertFails(getDoc(doc(db, "incidents/I1/pushBudget/family-2026-11-21")));
      await assertFails(setDoc(doc(db, "incidents/I1/pushBudget/family-2026-11-21"), { count: 0 }));
    }
  });
});
