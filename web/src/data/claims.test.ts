import { describe, expect, it } from "vitest";
import { claimsLine, NOT_SIGNED_IN_LINE, OTHER_ROLE_LINE, OTHER_SEARCH_LINE, PRACTICE_LINE } from "./claims";

const drill = { incidentId: "drill-test-1", practice: false };
const practice = { incidentId: "judge-abc", practice: true };

describe("claimsLine: whether this browser's sign-in still acts as command here", () => {
  it("says nothing while the sign-in names this incident as command", () => {
    expect(claimsLine({ inc: "drill-test-1", role: "command" }, drill)).toBeNull();
    expect(claimsLine({ inc: "judge-abc", role: "command" }, practice)).toBeNull();
  });

  it("on a drill, says the browser is signed in to another search when the sign-in names another incident", () => {
    expect(claimsLine({ inc: "judge-abc", role: "command" }, drill)).toBe(OTHER_SEARCH_LINE);
    expect(OTHER_SEARCH_LINE).toBe("You're signed in to another search in this browser. Reopen this drill with its command code to act as command.");
  });

  it("on a drill, says so when the sign-in holds this drill in another role", () => {
    expect(claimsLine({ inc: "drill-test-1", role: "searcher" }, drill)).toBe(OTHER_ROLE_LINE);
    expect(claimsLine({ inc: "drill-test-1", role: "family" }, drill)).toBe(OTHER_ROLE_LINE);
  });

  it("on a drill, says the browser is no longer signed in when it is signed out or holds no search", () => {
    expect(claimsLine(null, drill)).toBe(NOT_SIGNED_IN_LINE);
    expect(claimsLine({}, drill)).toBe(NOT_SIGNED_IN_LINE);
  });

  it("on a practice search, which has no join code, points back to the judge's page for every mismatch", () => {
    expect(claimsLine({ inc: "drill-test-1", role: "command" }, practice)).toBe(PRACTICE_LINE);
    expect(claimsLine({ inc: "judge-abc", role: "searcher" }, practice)).toBe(PRACTICE_LINE);
    expect(claimsLine(null, practice)).toBe(PRACTICE_LINE);
    expect(PRACTICE_LINE).not.toMatch(/code/i);
  });
});

describe("watchClaims: the line follows this browser's sign-in", () => {
  it("reports the line on each sign-in change, rechecks with fresh claims, reports a sign-out, and stops", async () => {
    const { vi } = await import("vitest");
    let listener: ((u: unknown) => void) | null = null;
    const unsubscribe = vi.fn();
    vi.doMock("firebase/auth", () => ({ onIdTokenChanged: (_a: unknown, cb: (u: unknown) => void) => ((listener = cb), unsubscribe) }));
    vi.resetModules();
    const { watchClaims } = await import("./claims");
    let claims: Record<string, unknown> = { inc: "drill-test-1", role: "command" };
    const forced: boolean[] = [];
    const user = { getIdTokenResult: async (force?: boolean) => (forced.push(force === true), { claims }) };
    const auth = { currentUser: user as unknown };
    const lines: (string | null)[] = [];
    const w = watchClaims(auth as never, drill, (l) => lines.push(l));
    listener!(user);
    await new Promise((r) => setTimeout(r, 0));
    claims = { inc: "judge-abc", role: "command" };
    listener!(user);
    await new Promise((r) => setTimeout(r, 0));
    w.recheck();
    await new Promise((r) => setTimeout(r, 0));
    auth.currentUser = null;
    listener!(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(lines).toEqual([null, OTHER_SEARCH_LINE, OTHER_SEARCH_LINE, NOT_SIGNED_IN_LINE]);
    expect(forced).toEqual([false, false, true]);
    w.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    vi.doUnmock("firebase/auth");
  });

  it("drops a read that finishes after the watch stopped, so it never overwrites the next watch", async () => {
    const { vi } = await import("vitest");
    let listener: ((u: unknown) => void) | null = null;
    vi.doMock("firebase/auth", () => ({ onIdTokenChanged: (_a: unknown, cb: (u: unknown) => void) => ((listener = cb), () => {}) }));
    vi.resetModules();
    const { watchClaims } = await import("./claims");
    let release: (v: { claims: Record<string, unknown> }) => void = () => {};
    const user = { getIdTokenResult: () => new Promise<{ claims: Record<string, unknown> }>((r) => { release = r; }) };
    const lines: (string | null)[] = [];
    const w = watchClaims({ currentUser: user } as never, drill, (l) => lines.push(l));
    listener!(user);
    w.stop();
    release({ claims: { inc: "judge-abc", role: "command" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(lines).toEqual([]);
    vi.doUnmock("firebase/auth");
  });
});
