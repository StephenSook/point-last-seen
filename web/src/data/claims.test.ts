import { describe, expect, it } from "vitest";
import { claimsLine, OTHER_ROLE_LINE, OTHER_SEARCH_LINE } from "./claims";

describe("claimsLine: whether this browser's sign-in still acts as command for this drill", () => {
  it("says nothing while the sign-in names this drill as command", () => {
    expect(claimsLine({ inc: "drill-test-1", role: "command" }, "drill-test-1")).toBeNull();
  });

  it("says the browser is signed in to another search when the sign-in names another incident", () => {
    expect(claimsLine({ inc: "judge-abc", role: "command" }, "drill-test-1")).toBe(OTHER_SEARCH_LINE);
    expect(OTHER_SEARCH_LINE).toBe("You're signed in to another search in this browser. Reopen this drill with its command code to act as command.");
  });

  it("says so when the sign-in holds this drill in another role", () => {
    expect(claimsLine({ inc: "drill-test-1", role: "searcher" }, "drill-test-1")).toBe(OTHER_ROLE_LINE);
    expect(claimsLine({ inc: "drill-test-1", role: "family" }, "drill-test-1")).toBe(OTHER_ROLE_LINE);
  });

  it("treats a sign-in with no search at all as another search", () => {
    expect(claimsLine({}, "drill-test-1")).toBe(OTHER_SEARCH_LINE);
  });
});

describe("watchClaims: the line follows this browser's sign-in", () => {
  it("reports the line on each sign-in change, rechecks with fresh claims, and stops", async () => {
    const { vi } = await import("vitest");
    let listener: ((u: unknown) => void) | null = null;
    const unsubscribe = vi.fn();
    vi.doMock("firebase/auth", () => ({ onIdTokenChanged: (_a: unknown, cb: (u: unknown) => void) => ((listener = cb), unsubscribe) }));
    vi.resetModules();
    const { watchClaims } = await import("./claims");
    let claims: Record<string, unknown> = { inc: "drill-test-1", role: "command" };
    const forced: boolean[] = [];
    const user = { getIdTokenResult: async (force?: boolean) => (forced.push(force === true), { claims }) };
    const lines: (string | null)[] = [];
    const w = watchClaims({ currentUser: user } as never, "drill-test-1", (l) => lines.push(l));
    listener!(user);
    await new Promise((r) => setTimeout(r, 0));
    claims = { inc: "judge-abc", role: "command" };
    listener!(user);
    await new Promise((r) => setTimeout(r, 0));
    w.recheck();
    await new Promise((r) => setTimeout(r, 0));
    expect(lines).toEqual([null, OTHER_SEARCH_LINE, OTHER_SEARCH_LINE]);
    expect(forced).toEqual([false, false, true]);
    w.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    vi.doUnmock("firebase/auth");
  });
});
