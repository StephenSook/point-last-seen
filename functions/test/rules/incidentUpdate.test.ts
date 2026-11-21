import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs } from "../helpers";

// Command's update of the incident doc names only the fields the command post writes (web/src/data and web/src/prior):
// conditions, searchState, status and closedReason, and the prior's fields with their version step. Every other
// field (mode, the grid, the name and labels, engine parameters, codes, media and setup state) is admin-owned.
const BASE = {
  name: "Drill", mode: "drill", status: "open", drillLabel: "Training drill. Nobody is missing.", terrainNote: "Flat park.",
  gridId: "piedmont-park-dev", gridAttribution: "OpenStreetMap", plsTimeMs: 1795860000000, priorVersion: 5, priorModel: "rings",
  priorSeed: 1, terrain: "urban", priorLayers: { linear: true }, ipp: { lat: 33.78, lon: -84.37 }, ippSource: "typed",
  priorInputEventIds: [], engineParams: { sweepWidthFactor: 1 }, searchState: "searching",
};

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set(BASE);
});
afterAll(closeClients);

describe("command updates only the fields the command post writes", () => {
  it("each field the command post writes is accepted", async () => {
    const db = dbAs("command-uid", commandClaims);
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { conditions: { tempF: 41, wet: true, setAtMs: 1795860000000 } }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { searchState: "paused" }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), {
      priorLayers: { linear: false, wedge: true }, terrain: "temperate_flat", priorModel: "rings", priorVersion: 6, priorBuiltAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), {
      ipp: { lat: 33.79, lon: -84.36 }, ippSource: "sighting", priorInputEventIds: ["0".repeat(32)], priorVersion: 7,
    }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { priorModel: "walkers", priorSeed: 9, priorInputEventIds: [], priorVersion: 8 }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { status: "found" }));
    await assertSucceeds(updateDoc(doc(db, "incidents/I1"), { status: "closed", closedReason: "found" }));
  });

  it("an unchanged write of the whole doc (a merge with the same values) is still accepted", async () => {
    await assertSucceeds(setDoc(doc(dbAs("command-uid", commandClaims), "incidents/I1"), { name: "Drill", mode: "drill", status: "open" }, { merge: true }));
  });

  it("every other field is refused, alone or riding along with an allowed one", async () => {
    const db = dbAs("command-uid", commandClaims);
    const refused: Record<string, unknown> = {
      mode: "judge", gridId: "kennesaw-mountain", gridAttribution: "x", name: "Renamed", drillLabel: "Real search.", terrainNote: "x",
      plsTimeMs: 1, engineParams: { sweepWidthFactor: 2 }, joinCodeHash: "a".repeat(64), commandJoinCodeHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000), closedAt: new Date(), mediaRevokedAt: new Date(), setupReady: true, somethingNew: 1,
    };
    for (const [k, v] of Object.entries(refused)) {
      await assertFails(updateDoc(doc(db, "incidents/I1"), { [k]: v }));
      await assertFails(updateDoc(doc(db, "incidents/I1"), { [k]: v, searchState: "paused" }));
    }
    await assertFails(updateDoc(doc(db, "incidents/I1"), { engineParams: { sweepWidthFactor: 2 }, priorVersion: 6 }));
  });

  it("the prior's version moves exactly one step: not two, not back, and not left unchanged when a prior field moves", async () => {
    const db = dbAs("command-uid", commandClaims);
    await assertFails(updateDoc(doc(db, "incidents/I1"), { terrain: "temperate_flat", priorVersion: 7 }));
    await assertFails(updateDoc(doc(db, "incidents/I1"), { terrain: "temperate_flat", priorVersion: 4 }));
    await assertFails(updateDoc(doc(db, "incidents/I1"), { terrain: "temperate_flat" }));
    await assertFails(updateDoc(doc(db, "incidents/I1"), { priorVersion: 7 }));
  });
});
