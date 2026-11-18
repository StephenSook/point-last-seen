import { describe, expect, it } from "vitest";
import { serverTimestamp } from "firebase/firestore";
import type { EventDoc } from "@pls/engine";
import { priorBatchOps } from "./write";

const prior = {
  segments: [{ segmentId: "AA", data: { priorPoa: 0.5, ringPoa: 0.5, priorVersion: 8 } }],
  row: { priorPoa: 0.5, priorVersion: 8 },
  incident: { priorLayers: { linear: false, wedge: true }, terrain: "temperate_flat" as const, priorVersion: 8, priorModel: "rings" as const },
};
const ev = (id: string) => ({ eventId: id, incidentId: "i", serverTime: null, type: "camera_sighting" }) as unknown as EventDoc;

describe("priorBatchOps", () => {
  it("puts every segment, ROW, the incident and the given events in one batch", () => {
    const ops = priorBatchOps("i", prior, [ev("a".repeat(32)), ev("b".repeat(32))]);
    expect(ops.map((o) => `${o.kind} ${o.path}`)).toEqual([
      "set incidents/i/segments/AA",
      "set incidents/i/segments/ROW",
      "update incidents/i",
      `create incidents/i/events/${"a".repeat(32)}`,
      `create incidents/i/events/${"b".repeat(32)}`,
    ]);
  });
  it("writes each event with the server's time, as the event writer does", () => {
    const ops = priorBatchOps("i", prior, [ev("a".repeat(32))]);
    const data = ops[3]!.data as { serverTime: unknown };
    expect((data.serverTime as ReturnType<typeof serverTimestamp>).isEqual(serverTimestamp())).toBe(true);
  });
  it("without events it is the plain prior batch", () => {
    expect(priorBatchOps("i", prior).map((o) => o.kind)).toEqual(["set", "set", "update"]);
  });
});
