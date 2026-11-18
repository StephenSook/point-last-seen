// The prior is rewritten in one batch (every segment, ROW and the incident) at the next priorVersion. Two command
// seats that rebuild from the same version must not both land: the second batch would overwrite the newer prior
// with probabilities from older inputs.
import { doc, writeBatch, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs } from "../helpers";

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
