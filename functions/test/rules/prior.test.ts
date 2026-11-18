// The prior is rewritten in one batch (every segment, ROW and the incident) at the next priorVersion. Two command
// seats that rebuild from the same version must not both land: the second batch would overwrite the newer prior
// with probabilities from older inputs.
import { doc, setDoc, writeBatch, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { commandEvent, validEvent } from "../fixtures";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims } from "../helpers";

const C = "command-uid";
const SEGS = ["AA", "AB", "AC"];

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open", priorVersion: 5 });
  for (const s of [...SEGS, "ROW"]) await admin.db.doc(`incidents/I1/segments/${s}`).set({ segmentId: s, priorPoa: 0.25, priorVersion: 5 });
});
afterAll(closeClients);

// Each seat's rebuild computes its own probabilities (poa), so a stale rebuild changes the numbers.
function priorBatch(db: Firestore, version: number, segments: string[] = SEGS, poa = 0.1 * version) {
  const b = writeBatch(db);
  for (const s of [...segments, "ROW"]) b.set(doc(db, `incidents/I1/segments/${s}`), { priorPoa: poa, priorVersion: version }, { merge: true });
  b.update(doc(db, "incidents/I1"), { priorModel: "walkers", priorVersion: version });
  return b.commit();
}

describe("the prior moves one version at a time", () => {
  it("a fresh rebuild at the next version lands; a second seat's rebuild from the same version is refused", async () => {
    const db = dbAs(C, commandClaims);
    await assertSucceeds(priorBatch(db, 6, SEGS, 0.3));
    await assertFails(priorBatch(db, 6, SEGS, 0.2));
    await assertSucceeds(priorBatch(db, 7));
  });
  it("the incident's priorVersion may only rise by exactly one", async () => {
    const db = dbAs(C, commandClaims);
    await assertFails(priorBatch(db, 7));
    await assertFails(updateDoc(doc(db, "incidents/I1"), { priorVersion: 4 }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { status: "found" }));
  });
  it("a segment cannot take a version the incident does not have after the write", async () => {
    const db = dbAs(C, commandClaims);
    const b = writeBatch(db);
    b.set(doc(db, "incidents/I1/segments/AA"), { priorPoa: 0.9, priorVersion: 6 }, { merge: true });
    await assertFails(b.commit());
  });
  it("a full-size rebuild (68 segments, ROW and the incident) fits the rules' limits", async () => {
    const many = Array.from({ length: 68 }, (_, i) => `S${String(i).padStart(2, "0")}`);
    for (const s of many) await admin.db.doc(`incidents/I1/segments/${s}`).set({ segmentId: s, priorPoa: 0.01, priorVersion: 5 });
    await assertSucceeds(priorBatch(dbAs(C, commandClaims), 6, many));
  });
});

// A camera Confirm at the command post is one batch: the segments, ROW, the incident (new start point, the camera
// sighting added to the prior's inputs, next version), the camera sighting and its confirmation. Two seats confirming
// the same clip build identical probabilities with different event ids; only the first may land.
const SHA = "c".repeat(64);
const camReading = { sighting: { personVisible: true, firstSeen: "00:02", lastSeen: "00:09", entryEdge: "left", exitEdge: "right",
  topColor: "red", bottomColor: "blue", topType: "coat", footwear: "slippers", headwear: "", carriedItems: [],
  keyFrame: { time: "00:05", box2d: [100, 200, 600, 400] }, lighting: "day", legibility: "clear", evidence: "walks right" },
  clipSha256: SHA, clipStartMs: 1795860000000, clockConfirmed: true, cameraFacingDeg: 90 };
const camEvent = (uid: string, seq: number, role = "command") => (role === "command" ? commandEvent : validEvent)(uid,
  { seq, role, teamId: null, reporter: "camera", inputMethod: "clip", positionSource: "camera_pin", type: "camera_sighting",
    effect: { kind: "none", why: "incorporated_in_prior" }, reading: camReading });

function confirmBatch(db: Firestore, uid: string, version: number, inputs: string[], seq = 1) {
  const cam = camEvent(uid, seq), conf = commandEvent(uid, { seq: seq + 1, type: "confirmation", targetEventId: cam.eventId, decision: "confirmed" });
  const b = writeBatch(db);
  for (const s of [...SEGS, "ROW"]) b.set(doc(db, `incidents/I1/segments/${s}`), { priorPoa: 0.4, priorVersion: version }, { merge: true });
  b.update(doc(db, "incidents/I1"), { priorModel: "rings", ipp: { lat: 33.78, lon: -84.37 }, priorInputEventIds: [...inputs, cam.eventId as string], priorVersion: version });
  b.set(doc(db, `incidents/I1/events/${cam.eventId}`), cam);
  b.set(doc(db, `incidents/I1/events/${conf.eventId}`), conf);
  return { id: cam.eventId as string, commit: () => b.commit() };
}

describe("a camera Confirm lands once (two seats, same clip, same version)", () => {
  beforeEach(async () => {
    await admin.db.doc(`incidents/I1/clipReadings/${SHA}`).set({ sha256: SHA, createdByUid: "family-uid", reading: null });
  });
  for (const [first, second] of [["seat-a", "seat-b"], ["seat-b", "seat-a"]]) {
    it(`${first} confirms first: ${second}'s identical batch from the same version is refused whole`, async () => {
      await assertSucceeds(confirmBatch(dbAs(first, commandClaims), first, 6, []).commit());
      const late = confirmBatch(dbAs(second, commandClaims), second, 6, []);
      await assertFails(late.commit());
      expect((await admin.db.doc(`incidents/I1/events/${late.id}`).get()).exists).toBe(false);
      const inc = (await admin.db.doc("incidents/I1").get()).data()!;
      expect(inc.priorVersion).toBe(6);
      expect(inc.priorInputEventIds).toHaveLength(1);
    });
  }
  it("a confirm from the newer version still lands", async () => {
    const a = confirmBatch(dbAs("seat-a", commandClaims), "seat-a", 6, []);
    await assertSucceeds(a.commit());
    await assertSucceeds(confirmBatch(dbAs("seat-b", commandClaims), "seat-b", 7, [a.id]).commit());
  });
  it("command cannot create a camera sighting outside a batch that moves the prior to the next version and lists it", async () => {
    const db = dbAs("seat-a", commandClaims);
    const alone = camEvent("seat-a", 1);
    await assertFails(setDoc(doc(db, `incidents/I1/events/${alone.eventId}`), alone));
    const b = writeBatch(db);
    for (const s of [...SEGS, "ROW"]) b.set(doc(db, `incidents/I1/segments/${s}`), { priorPoa: 0.4, priorVersion: 6 }, { merge: true });
    b.update(doc(db, "incidents/I1"), { priorInputEventIds: ["0".repeat(32)], priorVersion: 6 });
    b.set(doc(db, `incidents/I1/events/${alone.eventId}`), alone);
    await assertFails(b.commit());
  });
  it("the inputs must be a list: a map keyed by the sighting's id does not count (review)", async () => {
    const db = dbAs("seat-a", commandClaims);
    const cam = camEvent("seat-a", 1);
    const b = writeBatch(db);
    for (const s of [...SEGS, "ROW"]) b.set(doc(db, `incidents/I1/segments/${s}`), { priorPoa: 0.4, priorVersion: 6 }, { merge: true });
    b.update(doc(db, "incidents/I1"), { priorInputEventIds: { [cam.eventId as string]: true }, priorVersion: 6 });
    b.set(doc(db, `incidents/I1/events/${cam.eventId}`), cam);
    await assertFails(b.commit());
  });
  it("the family app still confirms a clip by itself (it never moves the prior)", async () => {
    const db = dbAs("family-uid", familyClaims);
    const cam = camEvent("family-uid", 1, "family");
    await assertSucceeds(setDoc(doc(db, `incidents/I1/events/${cam.eventId}`), cam));
  });
});

describe("the prior's inputs change only with the next version", () => {
  const inputs: Record<string, unknown> = { priorInputEventIds: ["0".repeat(32)], ipp: { lat: 33.79, lon: -84.37 }, ippSource: "sighting",
    priorLayers: { linear: false, wedge: true }, terrain: "urban", priorModel: "walkers", priorSeed: 7, engineParams: { sweepWidthFactor: 2 } };
  it("each input changed without a version step is refused, and with exactly one step is allowed", async () => {
    const db = dbAs("seat-a", commandClaims);
    for (const [k, v] of Object.entries(inputs)) {
      await assertFails(updateDoc(doc(db, "incidents/I1"), { [k]: v }));
      await assertFails(updateDoc(doc(db, "incidents/I1"), { [k]: v, priorVersion: 7 }));
    }
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { ipp: inputs.ipp, ippSource: "sighting", priorInputEventIds: inputs.priorInputEventIds, priorVersion: 6 }));
  });
});
