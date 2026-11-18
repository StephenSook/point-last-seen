import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { commandEvent, validEvent } from "../fixtures";
import {
  ID, ID2, ID3, ID4, ID5, admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs,
  familyClaims, searcherClaims,
} from "../helpers";

const S = "searcher-uid", S2 = "other-searcher-uid", C = "command-uid", F = "family-uid";
const path = (id: string) => `incidents/I1/events/${id}`;

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("events: create only, by members, with matching identity", () => {
  it("a member creates an event with a 32-hex id and matching uid", async () => {
    await assertSucceeds(setDoc(doc(dbAs(S, searcherClaims), path(ID)), validEvent(S)));
  });
  it("an identical second write is denied, and the writer can read the first copy back", async () => {
    const db = dbAs(S, searcherClaims);
    await assertSucceeds(setDoc(doc(db, path(ID)), validEvent(S)));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S)));
    expect((await getDoc(doc(db, path(ID)))).data()!.rawText).toBe(validEvent(S).rawText);
  });
  it("events cannot be updated or deleted, even by command", async () => {
    await admin.db.doc(path(ID)).set(validEvent(S, { serverTime: null }));
    const db = dbAs(C, commandClaims);
    await assertFails(updateDoc(doc(db, path(ID)), { rawText: "x" }));
    await assertFails(deleteDoc(doc(db, path(ID))));
  });
  it("an event queued for hours still lands", async () => {
    await assertSucceeds(setDoc(doc(dbAs(S, searcherClaims), path(ID2)), validEvent(S, { eventId: ID2, clientTimeMs: Date.now() - 6 * 3600_000 })));
  });
  it("a malformed id is rejected", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), "incidents/I1/events/short"), validEvent(S, { eventId: "short" })));
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), path("A".repeat(32))), validEvent(S, { eventId: "A".repeat(32) })));
  });
  it("the eventId field must equal the document id", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), path(ID)), validEvent(S, { eventId: ID2 })));
  });
  it("authorUid, incidentId, role and team must match the signed-in member", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { authorUid: S2 })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { incidentId: "I2" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { role: "command" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { teamId: "T2" })));
  });
  it("serverTime must be the server timestamp and schemaVersion 1", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { serverTime: 5 })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { schemaVersion: 2 })));
  });
  it("an unknown field or a missing field is rejected", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { extra: true })));
    const missing = validEvent(S);
    delete missing.rawText;
    await assertFails(setDoc(doc(db, path(ID)), missing));
  });
  it("a non-member or a member of another incident cannot write or read", async () => {
    await admin.db.doc(path(ID5)).set(validEvent(S, { eventId: ID5, serverTime: null }));
    await assertFails(setDoc(doc(dbAs("x", {}), path(ID)), validEvent("x")));
    await assertFails(setDoc(doc(dbAs("y", { inc: "I2", role: "searcher", team: "T1" }), path(ID)), validEvent("y")));
    await assertFails(getDoc(doc(dbAs("y", { inc: "I2", role: "searcher", team: "T1" }), path(ID5))));
    await assertFails(getDoc(doc(dbAs(null), path(ID5))));
  });
});

describe("events: identity binding, sizes and types", () => {
  it("an event's deviceId must be the author's own uid, so nobody can squat another device's event ids", async () => {
    await assertFails(setDoc(doc(dbAs(S2, searcherClaims), path(ID)), validEvent(S2, { deviceId: S })));
    await assertSucceeds(setDoc(doc(dbAs(S, searcherClaims), path(ID)), validEvent(S, { deviceId: S })));
  });
  it("rawText is at most 2,000 characters or null", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { rawText: "x".repeat(2001) })));
    await assertSucceeds(setDoc(doc(db, path(ID2)), validEvent(S, { eventId: ID2, rawText: "x".repeat(2000) })));
    await assertSucceeds(setDoc(doc(db, path(ID3)), validEvent(S, { eventId: ID3, rawText: null })));
  });
  it("closed enums and field types are checked", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { effect: { kind: "boost" } })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { reporter: "robot" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { positionSource: "satellite" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { inputMethod: "voice_api" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { isTrainingInject: "yes" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { priorVersion: 1.5 })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { targetEventId: "not-an-event-id" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { decision: "maybe" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { observedAtMs: "noon" })));
  });
});

describe("events: types by role", () => {
  it("a searcher cannot confirm a sighting; command can", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), path(ID3)),
      validEvent(S, { eventId: ID3, type: "confirmation", targetEventId: ID, decision: "confirmed" })));
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), path(ID4)),
      commandEvent(C, { eventId: ID4, type: "confirmation", targetEventId: ID, decision: "confirmed" })));
  });
  it("a searcher cannot write camera_sighting or destination", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { type: "camera_sighting" })));
    await assertFails(setDoc(doc(db, path(ID)), validEvent(S, { type: "destination" })));
  });
  it("family writes sightings, camera sightings, destinations and confirmations, but not clears", async () => {
    const db = dbAs(F, familyClaims);
    const fam = (id: string, type: string) => validEvent(F, { eventId: id, role: "family", teamId: null, reporter: "family", type });
    await assertSucceeds(setDoc(doc(db, path(ID)), fam(ID, "sighting")));
    await assertSucceeds(setDoc(doc(db, path(ID2)), fam(ID2, "camera_sighting")));
    await assertSucceeds(setDoc(doc(db, path(ID3)), fam(ID3, "destination")));
    await assertSucceeds(setDoc(doc(db, path(ID4)), { ...fam(ID4, "confirmation"), targetEventId: ID2, decision: "confirmed" }));
    await assertFails(setDoc(doc(db, path(ID5)), fam(ID5, "cleared")));
  });
  it("a searcher may retract only its own event; command may retract another author's", async () => {
    await admin.db.doc(path(ID)).set(validEvent(S, { serverTime: null }));
    await assertSucceeds(setDoc(doc(dbAs(S, searcherClaims), path(ID2)),
      validEvent(S, { eventId: ID2, type: "retraction", targetEventId: ID })));
    await assertFails(setDoc(doc(dbAs(S2, searcherClaims), path(ID3)),
      validEvent(S2, { eventId: ID3, type: "retraction", targetEventId: ID })));
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), path(ID4)),
      commandEvent(C, { eventId: ID4, type: "retraction", targetEventId: ID })));
  });
  it("a retraction of an event that does not exist is rejected", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), path(ID2)),
      validEvent(S, { eventId: ID2, type: "retraction", targetEventId: ID5 })));
  });
});
