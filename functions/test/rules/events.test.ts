import { deleteDoc, doc, getDoc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { commandEvent, eventIdFor, validEvent } from "../fixtures";
import {
  admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims,
} from "../helpers";

const S = "searcher-uid", S2 = "other-searcher-uid", C = "command-uid", F = "family-uid";
const path = (id: string) => `incidents/I1/events/${id}`;
/** Writes the event at its own eventId. */
const put = (db: Firestore, data: Record<string, unknown>) => setDoc(doc(db, path(data.eventId as string)), data);
/** An event seeded by admin (rules bypassed), used as a retraction or confirmation target. */
const TARGET = eventIdFor("I1", S, 100);

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("events: create only, by members, with matching identity", () => {
  it("a member creates an event at its derived 32-hex id with a matching uid", async () => {
    await assertSucceeds(put(dbAs(S, searcherClaims), validEvent(S)));
  });
  it("an identical second write is denied, and the writer can read the first copy back", async () => {
    const db = dbAs(S, searcherClaims);
    const e = validEvent(S);
    await assertSucceeds(put(db, e));
    await assertFails(put(db, e));
    expect((await getDoc(doc(db, path(e.eventId as string)))).data()!.rawText).toBe(e.rawText);
  });
  it("events cannot be updated or deleted, even by command", async () => {
    const e = validEvent(S, { serverTime: null });
    await admin.db.doc(path(e.eventId as string)).set(e);
    const db = dbAs(C, commandClaims);
    await assertFails(updateDoc(doc(db, path(e.eventId as string)), { rawText: "x" }));
    await assertFails(deleteDoc(doc(db, path(e.eventId as string))));
  });
  it("an event queued for hours still lands", async () => {
    await assertSucceeds(put(dbAs(S, searcherClaims), validEvent(S, { seq: 2, clientTimeMs: Date.now() - 6 * 3600_000 })));
  });
  it("a malformed id is rejected", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), "incidents/I1/events/short"), validEvent(S, { eventId: "short" })));
    const upper = (validEvent(S).eventId as string).toUpperCase();
    await assertFails(put(dbAs(S, searcherClaims), validEvent(S, { eventId: upper })));
  });
  it("the eventId field must equal the document id", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), path(eventIdFor("I1", S, 2))), validEvent(S)));
  });
  it("authorUid, incidentId, role and team must match the signed-in member", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(put(db, validEvent(S, { authorUid: S2 })));
    await assertFails(setDoc(doc(db, path(eventIdFor("I2", S, 1))), validEvent(S, { incidentId: "I2" })));
    await assertFails(put(db, validEvent(S, { role: "command" })));
    await assertFails(put(db, validEvent(S, { teamId: "T2" })));
  });
  it("serverTime must be the server timestamp and schemaVersion 1", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(put(db, validEvent(S, { serverTime: 5 })));
    await assertFails(put(db, validEvent(S, { schemaVersion: 2 })));
  });
  it("an unknown field or a missing field is rejected", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(put(db, validEvent(S, { extra: true })));
    const missing = validEvent(S);
    delete missing.rawText;
    await assertFails(put(db, missing));
  });
  it("a non-member or a member of another incident cannot write or read", async () => {
    const e = validEvent(S, { serverTime: null });
    await admin.db.doc(path(e.eventId as string)).set(e);
    await assertFails(put(dbAs("x", {}), validEvent("x")));
    await assertFails(put(dbAs("y", { inc: "I2", role: "searcher", team: "T1" }), validEvent("y")));
    await assertFails(getDoc(doc(dbAs("y", { inc: "I2", role: "searcher", team: "T1" }), path(e.eventId as string))));
    await assertFails(getDoc(doc(dbAs(null), path(e.eventId as string))));
  });
});

describe("events: the id is bound to its incident, writer and seq (Codex H1)", () => {
  it("nobody can occupy another device's future event id, even with their own uid", async () => {
    // S2 writes its own valid-looking event at the id S's phone will use for seq 5.
    const victimId = eventIdFor("I1", S, 5);
    await assertFails(put(dbAs(S2, searcherClaims), validEvent(S2, { seq: 5, eventId: victimId })));
    await assertSucceeds(put(dbAs(S, searcherClaims), validEvent(S, { seq: 5 })));
  });
  it("an id derived from a different seq, device or incident is rejected", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(put(db, validEvent(S, { seq: 2, eventId: eventIdFor("I1", S, 1) })));
    await assertFails(put(db, validEvent(S, { eventId: eventIdFor("I1", "some-device", 1) })));
    await assertFails(put(db, validEvent(S, { eventId: eventIdFor("I9", S, 1) })));
  });
  it("deviceId must be the writer's own uid", async () => {
    await assertFails(put(dbAs(S2, searcherClaims), validEvent(S2, { deviceId: S, eventId: eventIdFor("I1", S2, 1) })));
  });
  it("seq is a whole number of 0 or more; an epoch-ms seq works", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(put(db, validEvent(S, { seq: -1 })));
    await assertFails(put(db, validEvent(S, { seq: 1.5 })));
    await assertSucceeds(put(db, validEvent(S, { seq: 0 })));
    await assertSucceeds(put(db, validEvent(S, { seq: 1795860000000 })));
  });
});

describe("events: sizes and types", () => {
  it("rawText is at most 2,000 characters or null", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(put(db, validEvent(S, { rawText: "x".repeat(2001) })));
    await assertSucceeds(put(db, validEvent(S, { seq: 2, rawText: "x".repeat(2000) })));
    await assertSucceeds(put(db, validEvent(S, { seq: 3, rawText: null })));
  });
  it("closed enums and field types are checked", async () => {
    const db = dbAs(S, searcherClaims);
    for (const over of [
      { effect: { kind: "boost" } }, { reporter: "robot" }, { positionSource: "satellite" }, { inputMethod: "voice_api" },
      { isTrainingInject: "yes" }, { priorVersion: 1.5 }, { targetEventId: "not-an-event-id" }, { decision: "maybe" },
      { observedAtMs: "noon" },
    ]) await assertFails(put(db, validEvent(S, over)));
  });
});

describe("events: each effect variant is validated (spec section 8)", () => {
  const inputs = { coverage: 0.8, sweepWidthM: null, trackLengthM: null, areaM2: 15625, rdBasis: "open_target" };
  const cleared = { kind: "cleared", segmentId: "AC", pod: 0.55, inputs };
  const clue = { kind: "clue", influences: { AB: "strong_for", AA: "for" }, authenticity: "high" };
  it("well-formed cleared, clue and none effects are accepted", async () => {
    const db = dbAs(S, searcherClaims);
    await assertSucceeds(put(db, validEvent(S, { effect: cleared })));
    await assertSucceeds(put(db, validEvent(S, { seq: 2, type: "clue", effect: clue })));
    await assertSucceeds(put(db, validEvent(S, { seq: 3, effect: { kind: "none", why: "sound_only" } })));
  });
  it("a cleared effect without inputs, or with wrong types or bounds, is rejected", async () => {
    const db = dbAs(S, searcherClaims);
    const bad = [
      { kind: "cleared", segmentId: "AC", pod: 0.55 },
      { ...cleared, pod: "0.55" }, { ...cleared, pod: 1.5 }, { ...cleared, pod: -0.1 },
      { ...cleared, segmentId: 7 }, { ...cleared, extra: 1 },
      { ...cleared, inputs: { ...inputs, rdBasis: "guess" } }, { ...cleared, inputs: { ...inputs, coverage: -1 } },
      { ...cleared, inputs: { ...inputs, areaM2: 0 } }, { ...cleared, inputs: { coverage: 0.8 } },
      { ...cleared, inputs: { ...inputs, sweepWidthM: "wide" } }, { ...cleared, inputs: { ...inputs, extra: 1 } },
    ];
    for (const effect of bad) await assertFails(put(db, validEvent(S, { effect })));
  });
  it("a clue effect needs at least one known influence value and a known authenticity", async () => {
    const db = dbAs(S, searcherClaims);
    const bad = [
      { ...clue, influences: {} }, { ...clue, influences: { AB: "certain" } }, { ...clue, authenticity: "total" },
      { kind: "clue", influences: { AB: "for" } }, { ...clue, influences: "AB" },
    ];
    for (const effect of bad) await assertFails(put(db, validEvent(S, { type: "clue", effect })));
  });
  it("a none effect needs a known reason and nothing else", async () => {
    const db = dbAs(S, searcherClaims);
    for (const effect of [{ kind: "none", why: "because" }, { kind: "none" }, { kind: "none", why: "invalid", pod: 1 }]) {
      await assertFails(put(db, validEvent(S, { effect })));
    }
  });
});

describe("events: types by role", () => {
  it("a searcher cannot confirm a sighting; command can", async () => {
    await assertFails(put(dbAs(S, searcherClaims), validEvent(S, { type: "confirmation", targetEventId: TARGET, decision: "confirmed" })));
    await assertSucceeds(put(dbAs(C, commandClaims), commandEvent(C, { type: "confirmation", targetEventId: TARGET, decision: "confirmed" })));
  });
  it("a searcher cannot write camera_sighting or destination", async () => {
    const db = dbAs(S, searcherClaims);
    await assertFails(put(db, validEvent(S, { type: "camera_sighting" })));
    await assertFails(put(db, validEvent(S, { type: "destination" })));
  });
  it("family writes sightings, camera sightings, destinations and confirmations, but not clears", async () => {
    const db = dbAs(F, familyClaims);
    const fam = (seq: number, type: string, over: Record<string, unknown> = {}) =>
      validEvent(F, { seq, role: "family", teamId: null, reporter: "family", type, ...over });
    await assertSucceeds(put(db, fam(1, "sighting")));
    await assertSucceeds(put(db, fam(2, "camera_sighting")));
    await assertSucceeds(put(db, fam(3, "destination")));
    await assertSucceeds(put(db, fam(4, "confirmation", { targetEventId: eventIdFor("I1", F, 2), decision: "confirmed" })));
    await assertFails(put(db, fam(5, "cleared")));
  });
  it("a searcher may retract only its own event; command may retract another author's", async () => {
    await admin.db.doc(path(TARGET)).set(validEvent(S, { seq: 100, serverTime: null }));
    await assertSucceeds(put(dbAs(S, searcherClaims), validEvent(S, { seq: 2, type: "retraction", targetEventId: TARGET })));
    await assertFails(put(dbAs(S2, searcherClaims), validEvent(S2, { seq: 3, type: "retraction", targetEventId: TARGET })));
    await assertSucceeds(put(dbAs(C, commandClaims), commandEvent(C, { seq: 4, type: "retraction", targetEventId: TARGET })));
  });
  it("a retraction of an event that does not exist is rejected", async () => {
    await assertFails(put(dbAs(S, searcherClaims), validEvent(S, { seq: 2, type: "retraction", targetEventId: eventIdFor("I1", S, 999) })));
  });
});
