import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  convergenceCode, deriveClearedEffect, deriveClueEffect, eventId, eventSetHash, ioc, isPossibleEvidence,
  pod, posterior, rankSegments, toEngineEvents, trackLength,
} from "../src/index";
import { expectVector } from "./expectVector";

type Any = any;
const vectors: Any = JSON.parse(readFileSync(new URL("../../test-vectors/search.json", import.meta.url), "utf8"));

function run(section: string, i: Any): unknown {
  switch (section) {
    case "pod": return pod(i.coverage);
    case "trackLength": return trackLength(i.minutes, i.searchers, i.searchType, i.params);
    case "ioc": return ioc(i.influence, i.authenticity, i.params);
    case "posterior":
    case "orderIndependence": return posterior(i.prior, i.events, i.params);
    case "deriveEffect": return i.fn === "cleared" ? deriveClearedEffect(i.reading, i.ctx, i.params) : deriveClueEffect(i.reading, i.ctx);
    case "docToEngine": return toEngineEvents(i.docs, i.priorInputEventIds);
    case "rank": return rankSegments(i.result, i.prior);
    case "ids": {
      if (i.fn === "eventId") return { eventId: eventId(i.incidentId, i.deviceId, i.seq) };
      if (i.fn === "eventSet") { const h = eventSetHash(i.priorVersion, i.eventIds); return { eventSetHash: h, convergenceCode: convergenceCode(h) }; }
      return { convergenceCode: convergenceCode(i.hash) };
    }
    case "evidence": return isPossibleEvidence(i.text);
    default: throw new Error(`no runner for section ${section}`);
  }
}

const TS_SECTIONS: string[] = vectors.sections.filter((s: string) => s !== "router"); // the router is Swift only
let ran = 0;
for (const section of TS_SECTIONS) {
  describe(section, () => {
    for (const c of vectors[section]) it(c.name, () => { expectVector(run(section, c.input), c.expected); ran++; });
  });
}

describe("coverage", () => {
  it("covers every TypeScript vector", () => {
    expect(ran).toBe(TS_SECTIONS.reduce((n: number, s: string) => n + vectors[s].length, 0));
  });
  it("lists the eleven sections in order", () => {
    expect(vectors.sections).toEqual(["pod", "trackLength", "ioc", "posterior", "orderIndependence", "deriveEffect",
      "docToEngine", "rank", "ids", "router", "evidence"]);
  });
});
