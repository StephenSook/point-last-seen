// A plan's shape is checked where it is written (plan.schema.json), not only when the command post decodes it.
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, it } from "vitest";
import { routeRecord, validPlan } from "../fixtures";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, commandClaims, dbAs } from "../helpers";

const C = "command-uid";
const P = (id: string) => `incidents/I1/plans/${id}`;
const a = (i: number, over: Record<string, unknown> = {}) =>
  ({ teamId: `T${i}`, segmentIds: ["AA", "AB"], taskText: "Search segment AA.", reason: "Highest probability.", ...over });
// The heaviest assignment the rules admit: 6 segment ids of 16 characters and both texts at 200.
const heavy = (i: number) => a(i, { teamId: `T${i}`.padEnd(32, "x"), segmentIds: Array.from({ length: 6 }, (_, k) => `S${k}`.padEnd(16, "x")),
  taskText: "t".repeat(200), reason: "r".repeat(200) });
const plan = (version: number, over: Record<string, unknown> = {}) => ({ ...validPlan(C, version), ...over });

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open", priorVersion: 1 });
});
afterAll(closeClients);

describe("plan shape", () => {
  it("accepts a plan at its zero-padded version, with up to 10 assignments or none, even the heaviest", async () => {
    const db = dbAs(C, commandClaims);
    await assertSucceeds(setDoc(doc(db, P("0001")), plan(1, { assignments: Array.from({ length: 10 }, (_, i) => heavy(i)),
      wordingRoute: routeRecord() })));
    await assertSucceeds(setDoc(doc(db, P("0002")), plan(2, { assignments: [] })));
  });
  it("refuses a doc id that is not the plan's padded version", async () => {
    const db = dbAs(C, commandClaims);
    for (const [id, v] of [["0005", 4], ["5", 5], ["00x5", 5], ["0000", 0]] as const) await assertFails(setDoc(doc(db, P(id)), plan(v)));
  });
  it("refuses extra or missing fields, a bad hash, a client approval time and non-integer versions", async () => {
    const db = dbAs(C, commandClaims);
    const { wordingRoute: _w, ...missing } = plan(1);
    for (const bad of [{ ...plan(1), extra: 1 }, missing, plan(1, { basedOnEventSetHash: "x".repeat(64) }),
      plan(1, { approvedAt: new Date() }), plan(1, { priorVersion: 1.5 }), plan(1, { priorVersion: -1 }),
      plan(1, { createdClientTimeMs: "now" }), plan(1, { wordingRoute: { platform: "web" } })]) {
      await assertFails(setDoc(doc(db, P("0001")), bad));
    }
  });
  it("checks every assignment, the tenth as well as the first", async () => {
    const db = dbAs(C, commandClaims);
    const bads: Record<string, unknown>[] = [{ extra: true }, { teamId: "T-1" }, { teamId: "x".repeat(33) }, { teamId: 7 },
      { segmentIds: ["AA", "AB", "AC", "AD", "AE", "AF", "AG"] }, { segmentIds: ["x".repeat(17)] }, { segmentIds: ["AA,AB"] },
      { segmentIds: "AA" }, { segmentIds: [""] }, { taskText: "x".repeat(201) }, { reason: null }];
    const { reason: _r, ...noReason } = a(0);
    await assertFails(setDoc(doc(db, P("0001")), plan(1, { assignments: [noReason] })));
    for (const over of bads) {
      await assertFails(setDoc(doc(db, P("0001")), plan(1, { assignments: [a(0, over)] })));
      const ten = Array.from({ length: 10 }, (_, i) => (i === 9 ? a(i, over) : a(i)));
      await assertFails(setDoc(doc(db, P("0001")), plan(1, { assignments: ten })));
    }
    await assertFails(setDoc(doc(db, P("0001")), plan(1, { assignments: Array.from({ length: 11 }, (_, i) => a(i)) })));
    await assertFails(setDoc(doc(db, P("0001")), plan(1, { assignments: { 0: a(0) } })));
  });
  it("keeps the approval time the server's", async () => {
    await assertSucceeds(setDoc(doc(dbAs(C, commandClaims), P("0001")), plan(1, { approvedAt: serverTimestamp() })));
  });
});
