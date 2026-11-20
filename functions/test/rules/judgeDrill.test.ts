// A shared judge drill: every judge who joins with the searcher code or the family code holds the same claims, so
// several judges are members at once. None of them may close, delete or re-plan the drill, or change another
// member's data; each may make the normal searcher report and family answer and profile writes.
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { eventIdFor, sharedProfile, validEvent, validPlan } from "../fixtures";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, dbAs } from "../helpers";

const D = "drill-judge-1";
const searcher = (uid: string) => dbAs(uid, { inc: D, role: "searcher", team: "T1" });
const family = (uid: string) => dbAs(uid, { inc: D, role: "family", team: null });
const S1 = "judge-searcher-1", S2 = "judge-searcher-2", F1 = "judge-family-1", F2 = "judge-family-2";
const eventAt = (e: Record<string, unknown>) => `incidents/${D}/events/${e.eventId as string}`;
const ev = (uid: string, seq = 1) => validEvent(uid, { incidentId: D, seq, priorVersion: 5 });
const everyJudge = (): [string, Firestore][] => [[S1, searcher(S1)], [S2, searcher(S2)], [F1, family(F1)], [F2, family(F2)]];

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc(`incidents/${D}`).set({ name: "Judge drill", mode: "drill", drillLabel: "Training drill. Nobody is missing.",
    status: "open", priorVersion: 5, gridId: "piedmont-park-dev", gridAttribution: "OpenStreetMap" });
  await admin.db.doc(`incidents/${D}/segments/BO`).set({ segmentId: "BO", priorPoa: 0.1 });
  await admin.db.doc(`incidents/${D}/teams/T1`).set({ teamId: "T1", name: "Team 1", colorSlot: 1 });
  await admin.db.doc(`incidents/${D}/plans/0019`).set({ ...validPlan("practice-pack", 19), priorVersion: 5, approvedAt: new Date() });
  await admin.db.doc(`incidents/${D}/profile/shared`).set(sharedProfile());
});
afterAll(closeClients);

describe("a judge drill shared by many judges", () => {
  it("no searcher or family judge can close, relabel, re-plan or delete the drill", async () => {
    for (const [uid, db] of everyJudge()) {
      await assertFails(updateDoc(doc(db, `incidents/${D}`), { status: "closed" }));
      await assertFails(updateDoc(doc(db, `incidents/${D}`), { drillLabel: "Real search" }));
      await assertFails(updateDoc(doc(db, `incidents/${D}`), { searchState: "paused" }));
      await assertFails(deleteDoc(doc(db, `incidents/${D}`)));
      await assertFails(setDoc(doc(db, `incidents/${D}/plans/0020`), { ...validPlan(uid, 20), priorVersion: 5 }));
      await assertFails(deleteDoc(doc(db, `incidents/${D}/plans/0019`)));
      await assertFails(setDoc(doc(db, `incidents/${D}/segments/BO`), { segmentId: "BO", priorPoa: 0.9 }));
      await assertFails(setDoc(doc(db, `incidents/${D}/teams/T9`), { teamId: "T9", name: "Team 9", colorSlot: 9 }));
      await assertFails(deleteDoc(doc(db, `incidents/${D}/profile/shared`)));
    }
    // Control: the drill's command can change it, so the refusals above come from the role, not a broken setup.
    await assertSucceeds(updateDoc(doc(dbAs("drill-command", { inc: D, role: "command", team: null }), `incidents/${D}`), { searchState: "paused" }));
  });
  it("a searcher judge makes its own reports, and cannot change or delete another judge's", async () => {
    const mine = ev(S1);
    await assertSucceeds(setDoc(doc(searcher(S1), eventAt(mine)), mine));
    const theirs = { ...ev(S1, 2), rawText: "Cleared BO" };
    await admin.db.doc(eventAt(theirs)).set({ ...theirs, serverTime: new Date() });
    await assertFails(setDoc(doc(searcher(S2), eventAt(theirs)), { ...ev(S1, 2), rawText: "changed" }));
    await assertFails(updateDoc(doc(searcher(S2), eventAt(theirs)), { rawText: "changed" }));
    await assertFails(deleteDoc(doc(searcher(S2), eventAt(theirs))));
    // Nor can it write a report in another judge's name.
    const forged = validEvent(S1, { incidentId: D, seq: 3, deviceId: S2, priorVersion: 5, eventId: eventIdFor(D, S2, 3) });
    await assertFails(setDoc(doc(searcher(S2), eventAt(forged)), forged));
  });
  it("a family judge answers a question once; another family judge cannot change that answer", async () => {
    const q = `incidents/${D}/familyQuestions/${"q".repeat(20)}`;
    await admin.db.doc(q).set({ text: "Does she carry a phone?", createdByUid: "command", createdAt: new Date() });
    await assertSucceeds(updateDoc(doc(family(F1), q), { answer: "No", answeredByUid: F1, answeredAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(family(F2), q), { answer: "Yes", answeredByUid: F2, answeredAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(family(F2), q)));
  });
  it("a searcher judge cannot write the profile; a family judge's normal profile edit is allowed", async () => {
    await assertFails(setDoc(doc(searcher(S1), `incidents/${D}/profile/shared`), sharedProfile({ hair: "red" })));
    await assertSucceeds(setDoc(doc(family(F1), `incidents/${D}/profile/shared`), sharedProfile({ hair: "white" })));
  });
});
