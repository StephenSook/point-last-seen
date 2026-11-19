import { DEFAULT_PARAMS } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { incidentFromDoc } from "./incident";

const base = { name: "Drill", mode: "drill", status: "open", priorVersion: 4 };

describe("incidentFromDoc", () => {
  it("gives an incident saved before urban rings existed the urban rings, keeping what it stored", () => {
    const { urban: _u, ...oldRings } = DEFAULT_PARAMS.rings;
    const stored = { ...DEFAULT_PARAMS, rings: { ...oldRings, temperate_flat: [0.1, 0.2, 0.3, 0.4] } };
    const inc = incidentFromDoc({ ...base, engineParams: stored });
    expect(inc.engineParams!.rings.urban).toEqual(DEFAULT_PARAMS.rings.urban);
    expect(inc.engineParams!.rings.temperate_flat).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("fills the defaults when nothing was stored", () => {
    expect(incidentFromDoc(base).engineParams).toEqual(DEFAULT_PARAMS);
  });

  it("keeps the rest of the incident as stored", () => {
    expect(incidentFromDoc({ ...base, terrain: "urban" })).toMatchObject({ ...base, terrain: "urban" });
  });
});
