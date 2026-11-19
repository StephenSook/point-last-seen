import { describe, expect, it } from "vitest";
import { reportsIn } from "./reports";

type Ev = { eventId: string; type: string; role?: string; targetEventId?: string | null };
const ev = (eventId: string, type: string, more: Partial<Ev> = {}): Ev => ({ eventId, type, role: "searcher", targetEventId: null, ...more });

describe("reportsIn", () => {
  it("counts a sighting and command's confirmation of it as one report", () => {
    expect(reportsIn([ev("s", "sighting"), ev("c", "confirmation", { role: "command", targetEventId: "s" })])).toBe(1);
  });

  it("counts every report kind once and no confirmation, retraction or plan acknowledgement", () => {
    const kinds = ["clue", "sighting", "camera_sighting", "cleared", "found", "destination"];
    const events = [...kinds.map((k, i) => ev(`r${i}`, k)), ev("p", "plan_ack"), ev("c", "confirmation", { targetEventId: "r0" })];
    expect(reportsIn(events)).toBe(kinds.length);
  });

  it("leaves out a report that was retracted", () => {
    expect(reportsIn([ev("a", "clue"), ev("b", "clue"), ev("x", "retraction", { role: "command", targetEventId: "a" })])).toBe(1);
  });

  it("counts a family sighting command placed once: the placement points at the family's report", () => {
    const family = ev("f", "sighting", { role: "family" });
    const placed = ev("p", "sighting", { role: "command", targetEventId: "f" });
    expect(reportsIn([family, placed])).toBe(1);
  });

  it("counts an event delivered twice once", () => {
    expect(reportsIn([ev("s", "sighting"), ev("s", "sighting")])).toBe(1);
  });
});
