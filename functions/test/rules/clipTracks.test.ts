// A clip's track: incidents/{id}/clipTracks/{sha256}, written once by command or family of an open search, only for a
// clip whose reading is already stored, read by every member, never changed, deleted by command (web/src/data/clipTrack.ts).
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs, familyClaims, searcherClaims } from "../helpers";

const F = "family-uid", C = "command-uid", S = "searcher-uid";
const SHA = "c".repeat(64);
const path = (sha = SHA) => `incidents/I1/clipTracks/${sha}`;
const ROUTE = { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "sdk_only_in_cloud", latencyMs: 4000, sdkReported: true, blocked: null, decidedAtMs: 1795860000000 };
const track = (uid: string, over: Record<string, unknown> = {}) => ({
  version: "track-v1", sha256: SHA, window: { startS: 0, endS: 9 },
  entries: [{ t: 0, box: [700, 418, 1000, 591], source: "cloud", mask: [700, 450, 800, 590, 1000, 560] }, { t: 1, box: [657, 470, 1000, 684], source: "cloud" }],
  model: "gemini-3.5-flash-lite", route: ROUTE, framesSent: 10, createdByUid: uid, createdAt: serverTimestamp(), ...over,
});

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
  await admin.db.doc(`incidents/I1/clipReadings/${SHA}`).set({ sha256: SHA, reading: { personVisible: true }, route: ROUTE });
});
afterAll(closeClients);

describe("clip tracks", () => {
  it("command or family writes one for a read clip; every member reads it", async () => {
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), path()), track(C)));
    for (const [uid, claims] of [[S, searcherClaims], [F, familyClaims], [C, commandClaims]] as const) await assertSucceeds(getDoc(doc(dbAs(uid, claims), path())));
    await assertFails(getDoc(doc(dbAs("outsider", { inc: "I2", role: "command", team: null }), path())));
  });

  it("the family writes one too; a searcher cannot", async () => {
    await assertFails(setDoc(doc(dbAs(S, searcherClaims), path()), track(S)));
    await assertSucceeds(setDoc(doc(dbAs(F, familyClaims), path()), track(F)));
  });

  it("refuses a track before its clip's reading is stored", async () => {
    await admin.db.doc(`incidents/I1/clipReadings/${SHA}`).set({ sha256: SHA, reading: null, route: null });
    await assertFails(setDoc(doc(dbAs(C, commandClaims), path()), track(C)));
    await admin.db.doc(`incidents/I1/clipReadings/${SHA}`).delete();
    await assertFails(setDoc(doc(dbAs(C, commandClaims), path()), track(C)));
  });

  it("takes exactly its fields, for this clip, by its writer, at server time", async () => {
    const db = dbAs(C, commandClaims);
    for (const over of [{ version: "track-v2" }, { sha256: "d".repeat(64) }, { extra: true }, { createdByUid: F }, { createdAt: new Date(2026, 0, 1) },
      { entries: Array.from({ length: 122 }, (_, t) => ({ t, box: [1, 2, 3, 4], source: "cloud" })) }, { entries: "none" },
      { framesSent: 0 }, { framesSent: 2.5 }, { model: "" }, { window: { startS: 5, endS: 5 } }, { window: { startS: 0 } }, { route: { ...ROUTE, platform: "pager" } }]) {
      await assertFails(setDoc(doc(db, path()), track(C, over)));
    }
    await assertFails(setDoc(doc(db, path("NOT-A-HASH")), track(C, { sha256: "NOT-A-HASH" })));
  });

  it("refuses a closed search", async () => {
    await admin.db.doc("incidents/I1").update({ status: "closed" });
    await assertFails(setDoc(doc(dbAs(C, commandClaims), path()), track(C)));
  });

  it("is never changed; only command deletes it", async () => {
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), path()), track(C)));
    await assertFails(setDoc(doc(dbAs(C, commandClaims), path()), track(C)));
    await assertFails(updateDoc(doc(dbAs(C, commandClaims), path()), { framesSent: 3 }));
    await assertFails(deleteDoc(doc(dbAs(F, familyClaims), path())));
    await assertSucceeds(deleteDoc(doc(dbAs(C, commandClaims), path())));
  });
});
