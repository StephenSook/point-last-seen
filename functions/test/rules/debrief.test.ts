// A segment debrief (field expert): after a team clears a segment, how long it took and what worked or did not.
// incidents/{id}/debriefs/{segmentId}. Command writes any; a member writes only for a segment they cleared, pointing
// at their own cleared event. Command alone edits; nobody deletes; the engine never reads it.
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { validEvent } from "../fixtures";
import {
  admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims,
} from "../helpers";

const S = "searcher-uid", S2 = "other-searcher-uid", C = "command-uid", F = "family-uid";
const cleared = (uid: string, segmentId: string, seq = 1) => validEvent(uid, { seq, type: "cleared", serverTime: null,
  effect: { kind: "cleared", segmentId, pod: 0.5, inputs: { coverage: 1, sweepWidthM: 20, trackLengthM: 1000, areaM2: 20000, rdBasis: "default" } } });
const debrief = (uid: string, over: Record<string, unknown> = {}) =>
  ({ tookMinutes: 45, worked: "Walking the creek bank in pairs.", didNotWork: "Calling her name.", byUid: uid, createdAt: serverTimestamp(), ...over });
const put = (db: Firestore, seg: string, data: Record<string, unknown>) => setDoc(doc(db, `incidents/I1/debriefs/${seg}`), data);

let clearedId = "";
beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  const e = cleared(S, "AA");
  clearedId = e.eventId as string;
  await admin.db.doc(`incidents/I1/events/${clearedId}`).set(e);
});
afterAll(closeClients);

describe("segment debriefs", () => {
  it("command writes a debrief for any segment, with only the time or the notes too", async () => {
    const db = dbAs(C, commandClaims);
    await assertSucceeds(put(db, "AB", debrief(C)));
    await assertSucceeds(put(db, "AC", { tookMinutes: 0, byUid: C, createdAt: serverTimestamp() }));
  });
  it("the searcher who cleared the segment writes its debrief, pointing at their cleared event", async () => {
    await assertSucceeds(put(dbAs(S, searcherClaims), "AA", debrief(S, { clearedEventId: clearedId })));
  });
  it("a member who did not clear it, or points at the wrong segment or no event, cannot", async () => {
    await assertFails(put(dbAs(S2, searcherClaims), "AA", debrief(S2, { clearedEventId: clearedId })));
    await assertFails(put(dbAs(S, searcherClaims), "AB", debrief(S, { clearedEventId: clearedId })));
    await assertFails(put(dbAs(S, searcherClaims), "AA", debrief(S)));
    await assertFails(put(dbAs(S, searcherClaims), "AA", debrief(S, { clearedEventId: "0".repeat(32) })));
    await assertFails(put(dbAs(F, familyClaims), "AA", debrief(F, { clearedEventId: clearedId })));
  });
  it("only a cleared event counts: a member's own event of another type with a cleared effect does not (review)", async () => {
    // Seeded by admin, so the event write rule is bypassed: the debrief rule must check the type itself.
    const sighting = { ...cleared(F, "AA", 9), type: "sighting", role: "family", teamId: null };
    await admin.db.doc(`incidents/I1/events/${sighting.eventId}`).set(sighting);
    await assertFails(put(dbAs(F, familyClaims), "AA", debrief(F, { clearedEventId: sighting.eventId })));
  });
  it("takes exactly its fields, in bounds, written as the writer at server time", async () => {
    const db = dbAs(C, commandClaims);
    for (const over of [{ tookMinutes: -1 }, { tookMinutes: 1441 }, { tookMinutes: 4.5 }, { tookMinutes: "45" }, { worked: "x".repeat(501) },
      { didNotWork: 7 }, { byUid: S }, { createdAt: new Date(2026, 0, 1) }, { extra: true }, { clearedEventId: "not-hex" }]) {
      await assertFails(put(db, "AB", debrief(C, over)));
    }
    await assertSucceeds(put(db, "AB", debrief(C, { worked: "x".repeat(500), didNotWork: "" })));
  });
  it("only command edits a debrief, keeping who wrote it and when; nobody deletes it", async () => {
    await assertSucceeds(put(dbAs(S, searcherClaims), "AA", debrief(S, { clearedEventId: clearedId })));
    await assertFails(updateDoc(doc(dbAs(S, searcherClaims), "incidents/I1/debriefs/AA"), { tookMinutes: 50 }));
    const cmd = dbAs(C, commandClaims);
    await assertSucceeds(updateDoc(doc(cmd, "incidents/I1/debriefs/AA"), { tookMinutes: 50, didNotWork: "Calling her name. Too dark." }));
    await assertFails(updateDoc(doc(cmd, "incidents/I1/debriefs/AA"), { byUid: C }));
    await assertFails(updateDoc(doc(cmd, "incidents/I1/debriefs/AA"), { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(cmd, "incidents/I1/debriefs/AA"), { clearedEventId: null }));
    await assertFails(deleteDoc(doc(cmd, "incidents/I1/debriefs/AA")));
  });
  it("members read debriefs; a second create over an existing one is refused for a member", async () => {
    await assertSucceeds(put(dbAs(S, searcherClaims), "AA", debrief(S, { clearedEventId: clearedId })));
    await assertSucceeds(getDoc(doc(dbAs(F, familyClaims), "incidents/I1/debriefs/AA")));
    await assertFails(put(dbAs(S, searcherClaims), "AA", debrief(S, { clearedEventId: clearedId, tookMinutes: 5 })));
  });
});
