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

describe("postReducer with plans", () => {
  const plan = { version: 1, basedOnEventSetHash: "c".repeat(64), priorVersion: 1, assignments: [], wordingRoute: null, approvedByUid: "u", approvedAt: null, createdClientTimeMs: 1 };
  it("keeps approved plans and clears them on a denial", () => {
    const withPlans = postReducer(loaded, { type: "plans", plans: [plan] });
    expect(withPlans.plans).toEqual([plan]);
    const denied = postReducer(withPlans, { type: "failed", error: { code: "permission-denied" } });
    expect(denied.plans).toEqual([]);
    expect(postReducer(denied, { type: "plans", plans: [plan] })).toBe(denied);
  });

  it("keeps which plan versions are still being sent, and clears them on a denial", () => {
    const sending = postReducer(loaded, { type: "plans", plans: [plan], pending: [1] });
    expect(sending.pendingPlans).toEqual([1]);
    expect(postReducer(sending, { type: "plans", plans: [plan], pending: [] }).pendingPlans).toEqual([]);
    expect(postReducer(sending, { type: "failed", error: { code: "permission-denied" } }).pendingPlans).toEqual([]);
  });
});

describe("postReducer with plan records that can't be read", () => {
  it("keeps their ids beside the plans, and clears them on a denial", () => {
    const withBad = postReducer(loaded, { type: "plans", plans: [], unreadable: ["0002"] });
    expect(withBad.unreadablePlans).toEqual(["0002"]);
    expect(postReducer(withBad, { type: "plans", plans: [] }).unreadablePlans).toEqual([]);
    expect(postReducer(withBad, { type: "failed", error: { code: "permission-denied" } }).unreadablePlans).toEqual([]);
  });
});

describe("postReducer with the profile", () => {
  const profile = { shared: undefined, command: { previousAddresses: [], placesFrequented: [], pastWandering: [], nearbyWater: "creek", vehicle: null } };
  it("keeps the profile documents and clears them on a denial", () => {
    const withProfile = postReducer(loaded, { type: "profile", profile });
    expect(withProfile.profile).toBe(profile);
    const denied = postReducer(withProfile, { type: "failed", error: { code: "permission-denied" } });
    expect(denied.profile).toBeNull();
    expect(postReducer(denied, { type: "profile", profile })).toBe(denied);
  });
});

describe("plan history", () => {
  it("is loaded once a snapshot comes from the server (even an empty one), and stays loaded offline", () => {
    expect(initialPostState.plansLoaded).toBe(false);
    // A first snapshot from this laptop's cache (a fresh seat offline) does not know the server's versions.
    const cached = postReducer(initialPostState, { type: "plans", plans: [], fromServer: false });
    expect(cached.plansLoaded).toBe(false);
    const served = postReducer(cached, { type: "plans", plans: [], fromServer: true });
    expect(served.plansLoaded).toBe(true);
    expect(postReducer(served, { type: "plans", plans: [], fromServer: false }).plansLoaded).toBe(true);
  });
});
