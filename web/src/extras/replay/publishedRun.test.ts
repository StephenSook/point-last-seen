// The drill run the site serves at /evidence/published-run.json. The judge page replays this file, so it must pass
// the replay reader and end on the map the run recorded. The values it must reproduce are pinned in
// publishedRun.expect.json, starting with the file's own SHA-256: replacing the run without re-pinning fails here.
// A missing file fails these tests; it is never skipped.
//
// After exporting a new run (see docs/drill-day.md), check its end match code against the live command post for that
// incident, then re-pin with:  PLS_PIN_RUN=write npm test -w web -- extras/replay/publishedRun

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cubeGate, cubeScene } from "../cube/scene";
import type { PublishedRun } from "../hostApp";
import { fromPublishedRun } from "./replayData";
import { replayWindow, stateAt } from "./stateAt";

const runFile = fileURLToPath(new URL("../../../public/evidence/published-run.json", import.meta.url));
const expectFile = fileURLToPath(new URL("./publishedRun.expect.json", import.meta.url));

type Pinned = {
  sha256: string;
  runId: string;
  label: string;
  events: number;
  plans: number;
  endCode: string;
  planVersion: number | null;
  shown: number;
  cube: { pass: boolean; positioned: number };
};

/** What the served file produces now, in the shape the expectations pin. */
function measure(): Pinned {
  const bytes = readFileSync(runFile);
  const run = JSON.parse(bytes.toString("utf8")) as PublishedRun & { runId: string; label: string };
  const r = fromPublishedRun(run);
  if (!r.ok) throw new Error(`The served run is refused: ${r.reason}`);
  const w = replayWindow(r.data);
  if (!w) throw new Error("The served run has no window.");
  const end = stateAt(r.data, w.endMs);
  if (end.phase !== "replayable") throw new Error("The served run's last frame shows no map.");
  const gate = cubeGate(cubeScene(r.data, w));
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    runId: run.runId,
    label: run.label,
    events: r.data.events.length,
    plans: r.data.plans.length,
    endCode: end.view.code,
    planVersion: end.planVersion,
    shown: end.shown.length,
    cube: { pass: gate.pass, positioned: gate.positioned },
  };
}

if (process.env["PLS_PIN_RUN"] === "write") {
  it("writes the served run's expectations (PLS_PIN_RUN=write)", () => {
    writeFileSync(expectFile, `${JSON.stringify(measure(), null, 2)}\n`);
  });
} else {
  describe("the published drill run the site serves", () => {
    const pinned = JSON.parse(readFileSync(expectFile, "utf8")) as Pinned;

    it("is the file the expectations were pinned for", () => {
      expect(measure().sha256, "The served run changed: check its end code against the live command post, then re-pin (see the header).").toBe(pinned.sha256);
    });

    it("passes the replay reader and ends on the map the run recorded", () => {
      const now = measure();
      expect({ runId: now.runId, label: now.label, events: now.events, plans: now.plans }).toEqual({ runId: pinned.runId, label: pinned.label, events: pinned.events, plans: pinned.plans });
      expect({ endCode: now.endCode, planVersion: now.planVersion, shown: now.shown }).toEqual({ endCode: pinned.endCode, planVersion: pinned.planVersion, shown: pinned.shown });
    });

    it("passes the cube's gate only if the expectations say so, so no cube is shown or claimed by accident", () => {
      expect(measure().cube).toEqual(pinned.cube);
    });
  });
}
