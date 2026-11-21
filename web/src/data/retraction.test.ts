import { readFileSync } from "node:fs";
import type { EventDoc } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { buildRetraction } from "./sightings";

// The rules suite writes this exact document as command (functions/test/rules/events.test.ts), so the shape the command
// post sends is the shape the rules were proven against.
const fixture = JSON.parse(readFileSync(new URL("../../../functions/test/rules/retraction-event.json", import.meta.url), "utf8")) as { target: EventDoc; retraction: EventDoc };
const W = { incidentId: "drill-dev-1", uid: "uid-cmd", seq: 9, clientTimeMs: 1795859600000, priorVersion: 2, segments: [] };

describe("buildRetraction: command takes a report back", () => {
  it("is a new command event that points at the report and changes nothing itself", () => {
    const r = buildRetraction(fixture.target, W);
    expect(r).toMatchObject({ type: "retraction", role: "command", authorUid: "uid-cmd", targetEventId: fixture.target.eventId, decision: null, reporter: "system", effect: { kind: "none", why: "informational" }, rawText: null, position: null });
    // A retraction of a training inject is part of the inject.
    expect(r.isTrainingInject).toBe(fixture.target.isTrainingInject);
  });

  it("is exactly the document the rules suite writes as command", () => {
    expect(buildRetraction(fixture.target, W)).toEqual(fixture.retraction);
  });
});
