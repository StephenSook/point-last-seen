// The development drill run the site serves at /evidence/published-run.json. The judge page replays this file, so
// it must pass the replay reader, end on the map the run recorded, and not pass the cube's gate (no wait of a minute
// or more), so no cube is shown or claimed for it. A missing file fails these tests; it is never skipped.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cubeGate, cubeScene } from "../cube/scene";
import type { PublishedRun } from "../laneC";
import { fromPublishedRun } from "./replayData";
import { replayWindow, stateAt } from "./stateAt";

const file = fileURLToPath(new URL("../../../public/evidence/published-run.json", import.meta.url));

function servedRun() {
  const r = fromPublishedRun(JSON.parse(readFileSync(file, "utf8")) as PublishedRun);
  if (!r.ok) throw new Error(`The served run is refused: ${r.reason}`);
  const w = replayWindow(r.data);
  if (!w) throw new Error("The served run has no window.");
  return { data: r.data, w };
}

describe("the published drill run the site serves", () => {
  it("passes the replay reader and ends on the map the run recorded", () => {
    const { data, w } = servedRun();
    expect(data.events).toHaveLength(24);
    expect(data.plans).toHaveLength(18);
    const end = stateAt(data, w.endMs);
    expect(end.phase).toBe("replayable");
    if (end.phase !== "replayable") return;
    expect(end.view.code).toBe("T43J");
    expect(end.planVersion).toBe(18);
    expect(end.shown).toHaveLength(24);
  });

  it("does not pass the cube's gate, so the judge page shows no cube for it", () => {
    const { data, w } = servedRun();
    const gate = cubeGate(cubeScene(data, w));
    expect(gate.pass).toBe(false);
    expect(gate.positioned).toBe(15);
    expect(gate.longestWaitS).toBeLessThan(60);
  });
});
