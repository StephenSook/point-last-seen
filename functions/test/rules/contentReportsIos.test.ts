// The iPhone's Report a problem documents against the create rule. shared/test-vectors/content-report-ios.json holds
// what the iPhone writes (a Swift test pins every case to the iPhone's own ContentReport): each is accepted with the
// server's time, and copies broken the ways a client could break them are refused.
import { readFileSync } from "node:fs";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { admin, assertFails, assertSucceeds, clearFirestore, closeClients, dbAs, searcherClaims } from "../helpers";

type Fields = Record<string, unknown>;
const vector: { authorUid: string; cases: { name: string; fields: Fields }[] } = JSON.parse(
  readFileSync(new URL("../../../shared/test-vectors/content-report-ios.json", import.meta.url), "utf8"),
);
const reportId = (n: number) => n.toString(16).padStart(32, "0");

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/I1").set({ name: "Drill", mode: "drill", status: "open" });
});
afterAll(closeClients);

describe("content reports as the iPhone writes them", () => {
  it("every case the iPhone writes is accepted with the server's time", async () => {
    expect(vector.cases.length).toBe(4);
    const db = dbAs(vector.authorUid, searcherClaims);
    for (const [i, c] of vector.cases.entries()) {
      await assertSucceeds(setDoc(doc(db, `incidents/I1/contentReports/${reportId(i + 1)}`), { ...c.fields, createdAt: serverTimestamp() }));
    }
  });

  it("a malformed copy of the iPhone's report is refused", async () => {
    const db = dbAs(vector.authorUid, searcherClaims);
    const good: Fields = { ...vector.cases[0]!.fields, createdAt: serverTimestamp() };
    const broken: [string, Fields][] = [
      ["no server time", (({ createdAt: _t, ...r }) => r)(good)],
      ["the phone's own time", { ...good, createdAt: new Date() }],
      ["a note over 500 code points", { ...good, note: "x".repeat(501) }],
      ["an extra field", { ...good, deviceId: "d1" }],
      ["another role", { ...good, role: "family" }],
      ["someone else's name", { ...good, authorUid: "searcher-2" }],
      ["no reason", (({ reason: _r, ...r }) => r)(good)],
      ["a target id on the family's description", { ...good, target: "family_description" }],
      ["no target id on the task", { ...good, targetId: null }],
    ];
    for (const [i, [name, data]] of broken.entries()) {
      try {
        await assertFails(setDoc(doc(db, `incidents/I1/contentReports/${reportId(100 + i)}`), data));
      } catch (e) {
        throw new Error(`${name}: ${String(e)}`);
      }
    }
    // The same document unbroken is taken, so each refusal above comes from its change, not from the setup.
    await assertSucceeds(setDoc(doc(db, `incidents/I1/contentReports/${reportId(1)}`), good));
  });
});
