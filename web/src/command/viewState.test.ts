import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, posterior, toEngineEvents, type EventDoc } from "@pls/engine";
import vectors from "../../../shared/test-vectors/search.json";
import { lastReportChange, viewState } from "./viewState";

const fixture = (vectors as unknown as { docToEngine: { name: string; input: { docs: EventDoc[] } }[] }).docToEngine.find(
  (c) => c.name === "mixed_output_sorted_by_event_id",
)!;
const docs = fixture.input.docs;
const ids = ["AA", "AB", "AC", "AD", "AE", "AF"];
const prior = [...ids.map((segmentId) => ({ segmentId, priorPoa: 0.15 })), { segmentId: "ROW", priorPoa: 0.1 }];

describe("viewState", () => {
  it("is the same for any arrival order", () => {
    const a = viewState(prior, docs, [], DEFAULT_PARAMS, 1);
    const b = viewState(prior, [...docs].reverse(), [], DEFAULT_PARAMS, 1);
    expect(b.code).toBe(a.code);
    expect(b.hash).toBe(a.hash);
    expect(b.result.poa).toEqual(a.result.poa);
  });

  it("gives a four-character code that changes with the prior version", () => {
    const a = viewState(prior, docs, [], DEFAULT_PARAMS, 1);
    expect(a.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(viewState(prior, docs, [], DEFAULT_PARAMS, 2).hash).not.toBe(a.hash);
  });

  it("applies exactly the events the engine's filter keeps", () => {
    const v = viewState(prior, docs, [], DEFAULT_PARAMS, 1);
    expect(v.result).toEqual(posterior(prior, toEngineEvents(docs, []), DEFAULT_PARAMS));
    expect(v.result.appliedEventIds.length).toBeGreaterThan(0);
  });

  it("ranks segments by POA and keeps ROW out of the ranked list", () => {
    const v = viewState(prior, docs, [], DEFAULT_PARAMS, 1);
    expect(v.rank.map((r) => r.segmentId)).not.toContain("ROW");
    for (let i = 1; i < v.rank.length; i++) expect(v.rank[i]!.poa).toBeLessThanOrEqual(v.rank[i - 1]!.poa);
    expect(v.result.poa["ROW"]).toBeGreaterThan(0);
  });

  it("an event listed as a prior input changes nothing", () => {
    const all = viewState(prior, docs, docs.map((d) => d.eventId), DEFAULT_PARAMS, 1);
    expect(all.result.poa).toEqual(viewState(prior, [], [], DEFAULT_PARAMS, 1).result.poa);
  });

  it("counts each event once in the code even when it arrives twice", () => {
    expect(viewState(prior, [...docs, ...docs], [], DEFAULT_PARAMS, 1).code).toBe(viewState(prior, docs, [], DEFAULT_PARAMS, 1).code);
  });
});

describe("lastReportChange", () => {
  const base = docs[0]!;
  const at = (d: EventDoc, eventId: string, t: number, over: Partial<EventDoc>): EventDoc => ({ ...d, eventId, clientTimeMs: t, seq: t, ...over });
  const clue = at(base, "clue-1", 9_000, {
    type: "clue",
    isTrainingInject: true,
    effect: { kind: "clue", influences: { AC: "strong_for" }, authenticity: "high" },
  });

  it("is what the newest report did: the posterior without it against the posterior with it", () => {
    const c = lastReportChange(prior, [clue], [], DEFAULT_PARAMS)!;
    expect(c.causeEventId).toBe("clue-1");
    expect(c.before).toEqual(posterior(prior, toEngineEvents([], []), DEFAULT_PARAMS).poa);
    expect(c.after).toEqual(posterior(prior, toEngineEvents([clue], []), DEFAULT_PARAMS).poa);
    expect(c.change.changed[0]!.segmentId).toBe("AC");
    expect(c.change.changed[0]!.deltaPts).toBeGreaterThan(0);
  });

  it("skips plan acknowledgements, which never move the map", () => {
    const ack = at(base, "ack-1", 10_000, { type: "plan_ack", effect: { kind: "none", why: "informational" } });
    expect(lastReportChange(prior, [clue, ack], [], DEFAULT_PARAMS)!.causeEventId).toBe("clue-1");
  });

  it("is null before any report", () => {
    expect(lastReportChange(prior, [], [], DEFAULT_PARAMS)).toBeNull();
  });
});
