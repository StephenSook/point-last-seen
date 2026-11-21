import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { validEvent } from "../fixtures";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const S = "searcher-uid", C = "command-uid", F = "family-uid", S2 = "searcher-2";

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc("incidents/I1/segments/AC").set({ segmentId: "AC", priorPoa: 0.1 });
  // The searcher S was removed by command (members.ts writes this before clearing the claims).
  await admin.db.doc(`incidents/I1/removed/${S}`).set({ removedAt: new Date(), removedBy: C, role: "searcher", team: "T1" });
});
afterAll(closeClients);

describe("a removed member is refused at once, even while its ID token still carries the claims", () => {
  it("cannot read the incident or its segments", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(getDoc(doc(db, "incidents/I1")));
    await assertFails(getDoc(doc(db, "incidents/I1/segments/AC")));
  });
  it("cannot write an event", async () => {
    const e = validEvent(S);
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), `incidents/I1/events/${e.eventId}`), e));
  });
  it("another searcher, command and the family are not affected", async () => {
    await assertSucceeds(getDoc(doc(dbAs(S2, searcherClaims), "incidents/I1")));
    await assertSucceeds(getDoc(doc(dbAs(C, commandClaims), "incidents/I1")));
    await assertSucceeds(getDoc(doc(dbAs(F, familyClaims), "incidents/I1")));
    const e = validEvent(S2);
    await assertSucceeds(setDoc(doc(dbAs(S2, searcherClaims), `incidents/I1/events/${e.eventId}`), e));
  });
});

describe("the removal records", () => {
  it("command reads them; a searcher or the family does not", async () => {
    await assertSucceeds(getDoc(doc(dbAs(C, commandClaims), `incidents/I1/removed/${S}`)));
    await assertFails(getDoc(doc(dbAs(S2, searcherClaims), `incidents/I1/removed/${S}`)));
    await assertFails(getDoc(doc(dbAs(F, familyClaims), `incidents/I1/removed/${S}`)));
  });
  it("no client writes or deletes one, command included", async () => {
    await assertFails(setDoc(doc(dbAs(C, commandClaims), `incidents/I1/removed/${S2}`), { removedBy: C, role: "searcher" }));
    await assertFails(deleteDoc(doc(dbAs(C, commandClaims), `incidents/I1/removed/${S}`)));
    await assertFails(deleteDoc(doc(dbAs(S, searcherClaims), `incidents/I1/removed/${S}`)));
    await assertFails(setDoc(doc(dbAs(S2, searcherClaims), `incidents/I1/removed/${S2}`), { removedBy: S2 }));
  });
});
