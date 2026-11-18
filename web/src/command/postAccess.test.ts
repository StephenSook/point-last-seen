import { describe, expect, it } from "vitest";
import { initialPostState, listenerFailure, postReducer, type PostState } from "./postAccess";

const view = { incident: { name: "Drill", mode: "drill" as const, status: "open" as const, priorVersion: 1 }, teams: [{ teamId: "T1", name: "Team 1" }], segments: [], rowPrior: 0.1, clockOffsets: {} };
const events = [{ eventId: "e1", serverTimeMs: 1, pendingWrite: false }];
const loaded: PostState = { ...initialPostState, view, events };

describe("listenerFailure", () => {
  it("treats permission and auth errors as a denial", () => {
    expect(listenerFailure({ code: "permission-denied" })).toBe("denied");
    expect(listenerFailure({ code: "unauthenticated" })).toBe("denied");
  });

  it("treats anything else as a passing failure", () => {
    expect(listenerFailure({ code: "unavailable" })).toBe("transient");
    expect(listenerFailure(new Error("x"))).toBe("transient");
    expect(listenerFailure(null)).toBe("transient");
  });
});

describe("postReducer", () => {
  it("a denial clears the incident, the events and every on-screen trace of them", () => {
    const s = postReducer(loaded, { type: "failed", error: { code: "permission-denied" } });
    expect(s.denied).toBe(true);
    expect(s.view).toBeNull();
    expect(s.events).toEqual([]);
  });

  it("after a denial, late data from a listener is ignored", () => {
    const denied = postReducer(loaded, { type: "failed", error: { code: "unauthenticated" } });
    expect(postReducer(denied, { type: "view", view })).toBe(denied);
    expect(postReducer(denied, { type: "events", events })).toBe(denied);
  });

  it("a connection failure keeps the last data and says so", () => {
    const s = postReducer(loaded, { type: "failed", error: { code: "unavailable" } });
    expect(s.denied).toBe(false);
    expect(s.view).toBe(view);
    expect(s.events).toBe(events);
    expect(s.offline).toBe(true);
  });

  it("fresh data clears the offline note", () => {
    const off = postReducer(loaded, { type: "failed", error: { code: "unavailable" } });
    expect(postReducer(off, { type: "events", events }).offline).toBe(false);
  });
});
