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

describe("watchClaims: only the newest read decides the line, and forced reads are spaced", () => {
  it("drops a read that finishes after a newer one, so an old sign-in never overwrites the current line", async () => {
    const { vi } = await import("vitest");
    let listener: ((u: unknown) => void) | null = null;
    vi.doMock("firebase/auth", () => ({ onIdTokenChanged: (_a: unknown, cb: (u: unknown) => void) => ((listener = cb), () => {}) }));
    vi.resetModules();
    const { watchClaims } = await import("./claims");
    const pending: ((v: { claims: Record<string, unknown> }) => void)[] = [];
    const user = { getIdTokenResult: () => new Promise<{ claims: Record<string, unknown> }>((r) => pending.push(r)) };
    const lines: (string | null)[] = [];
    watchClaims({ currentUser: user } as never, drill, (l) => lines.push(l));
    listener!(user);
    listener!(user);
    pending[1]!({ claims: { inc: "drill-test-1", role: "command" } });
    await new Promise((r) => setTimeout(r, 0));
    pending[0]!({ claims: { inc: "judge-abc", role: "command" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(lines).toEqual([null]);
    vi.doUnmock("firebase/auth");
  });

  it("asks the server again at most once in 30 seconds, and never while a forced read is running", async () => {
    const { vi } = await import("vitest");
    vi.doMock("firebase/auth", () => ({ onIdTokenChanged: () => () => {} }));
    vi.resetModules();
    const { watchClaims } = await import("./claims");
    let release: () => void = () => {};
    const forced: boolean[] = [];
    const user = { getIdTokenResult: (force?: boolean) => (forced.push(force === true), new Promise<{ claims: Record<string, unknown> }>((r) => { release = () => r({ claims: { inc: "drill-test-1", role: "command" } }); })) };
    let t = 1_000_000;
    const w = watchClaims({ currentUser: user } as never, drill, () => {}, () => t);
    w.recheck();
    w.recheck();
    release();
    await new Promise((r) => setTimeout(r, 0));
    t += 10_000;
    w.recheck();
    t += 25_000;
    w.recheck();
    expect(forced).toEqual([true, true]);
    vi.doUnmock("firebase/auth");
  });
});

describe("watchClaims: a refusal's recheck is never dropped, and a stalled read does not block", () => {
  async function setup() {
    const { vi } = await import("vitest");
    vi.doMock("firebase/auth", () => ({ onIdTokenChanged: () => () => {} }));
    vi.resetModules();
    const { watchClaims } = await import("./claims");
    const releases: (() => void)[] = [];
    const forced: boolean[] = [];
    const user = { getIdTokenResult: (force?: boolean) => (forced.push(force === true), new Promise<{ claims: Record<string, unknown> }>((r) => { releases.push(() => r({ claims: { inc: "drill-test-1", role: "command" } })); })) };
    const clock = { t: 1_000_000 };
    const w = watchClaims({ currentUser: user } as never, drill, () => {}, () => clock.t);
    return { vi, w, forced, releases, clock };
  }

  it("an urgent recheck runs inside the 30-second spacing, and one that arrives during a forced read runs after it", async () => {
    const { vi, w, forced, releases, clock } = await setup();
    w.recheck();
    w.recheck(true);
    expect(forced).toEqual([true]);
    releases[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(forced).toEqual([true, true]);
    releases[1]!();
    await new Promise((r) => setTimeout(r, 0));
    clock.t += 1_000;
    w.recheck(true);
    expect(forced).toEqual([true, true, true]);
    vi.doUnmock("firebase/auth");
  });

  it("a forced read still running after 30 seconds no longer blocks the next recheck", async () => {
    const { vi, w, forced, clock } = await setup();
    w.recheck();
    clock.t += 10_000;
    w.recheck();
    expect(forced).toEqual([true]);
    clock.t += 25_000;
    w.recheck();
    expect(forced).toEqual([true, true]);
    vi.doUnmock("firebase/auth");
  });
});

describe("watchClaims: an older token never overwrites a newer one", () => {
  it("ignores a token issued before the newest one it applied, even when its event comes last", async () => {
    const { vi } = await import("vitest");
    let listener: ((u: unknown) => void) | null = null;
    vi.doMock("firebase/auth", () => ({ onIdTokenChanged: (_a: unknown, cb: (u: unknown) => void) => ((listener = cb), () => {}) }));
    vi.resetModules();
    const { watchClaims } = await import("./claims");
    const pending: ((v: { claims: Record<string, unknown>; issuedAtTime: string }) => void)[] = [];
    const user = { getIdTokenResult: () => new Promise<{ claims: Record<string, unknown>; issuedAtTime: string }>((r) => pending.push(r)) };
    const lines: (string | null)[] = [];
    watchClaims({ currentUser: user } as never, drill, (l) => lines.push(l));
    // Another window moved this account to another search: its token (issued 12:05) is applied first.
    listener!(user);
    pending[0]!({ claims: { inc: "judge-abc", role: "command" }, issuedAtTime: "Sat, 21 Nov 2026 12:05:00 GMT" });
    await new Promise((r) => setTimeout(r, 0));
    // A refresh started earlier returns this drill's token (issued 12:00), and its event comes last.
    listener!(user);
    pending[1]!({ claims: { inc: "drill-test-1", role: "command" }, issuedAtTime: "Sat, 21 Nov 2026 12:00:00 GMT" });
    await new Promise((r) => setTimeout(r, 0));
    expect(lines).toEqual([OTHER_SEARCH_LINE]);
    // A newer token still applies.
    listener!(user);
    pending[2]!({ claims: { inc: "drill-test-1", role: "command" }, issuedAtTime: "Sat, 21 Nov 2026 12:10:00 GMT" });
    await new Promise((r) => setTimeout(r, 0));
    expect(lines).toEqual([OTHER_SEARCH_LINE, null]);
    vi.doUnmock("firebase/auth");
  });
});
