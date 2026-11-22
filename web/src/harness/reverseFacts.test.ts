import { describe, expect, it } from "vitest";
import { factsSent, reverseFacts } from "./reverseFacts";
import { planPrompt, type PlanDraft } from "../ai/replanWording";

describe("the measurement page's reversed fact order", () => {
  it("reverses each team's facts and nothing else, keeping a fact's segments with it", () => {
    const t = "Teams, their segments, and the facts code found for those segments:\nT1 searches CC. Facts: a (CC), b (CC, CD), c (CC)\nT2 has no segment. Facts: none.";
    expect(reverseFacts(t).split("\n")).toEqual([
      "Teams, their segments, and the facts code found for those segments:",
      "T1 searches CC. Facts: c (CC), b (CC, CD), a (CC)",
      "T2 has no segment. Facts: none.",
    ]);
  });
  it("on the command post's own prompt, gives the same facts in the opposite order", () => {
    const draft: PlanDraft = {
      eventSetHash: "x", priorVersion: 1,
      rank: [{ segmentId: "CC", rank: 1, poa: 0.3, priorPoa: 0.2, deltaPoa: 0.1 }, { segmentId: "CD", rank: 2, poa: 0.2, priorPoa: 0.1, deltaPoa: 0.1 }],
      assignments: [{ teamId: "T1", segmentIds: ["CC", "CD"] }],
      facts: { CC: { featureClasses: ["trail"], searched: false, raisedByLastReport: true, ring: null }, CD: { featureClasses: ["trail"], searched: true, raisedByLastReport: false, ring: null } },
    };
    const forward = factsSent(planPrompt(draft))[0]!.split(/(?<=\)), /);
    const back = factsSent(reverseFacts(planPrompt(draft)))[0]!.split(/(?<=\)), /);
    expect(back).toEqual([...forward].reverse());
    expect(forward.length).toBeGreaterThan(3);
  });
});
