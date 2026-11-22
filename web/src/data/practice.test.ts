import { describe, expect, it } from "vitest";
import { isSettingUp, practiceErrorMessage, startPracticeSearch, startWithRetry } from "./practice";
import { MissingConfigError, readEnv } from "../firebaseConfig";

const fbErr = (code: string, message: string) => Object.assign(new Error(message), { code });

describe("startPracticeSearch", () => {
  it("starts the sandbox, then refreshes the sign-in so its command claims apply, and returns the incident", async () => {
    const order: string[] = [];
    const id = await startPracticeSearch({
      call: async () => { order.push("call"); return { data: { incidentId: "judge-u1", role: "command" } }; },
      refresh: async () => { order.push("refresh"); },
    });
    expect(id).toBe("judge-u1");
    expect(order).toEqual(["call", "refresh"]);
  });

  it("refuses an answer that is not a command seat on a practice incident", async () => {
    await expect(startPracticeSearch({ call: async () => ({ data: { incidentId: "drill-dev-1", role: "command" } }), refresh: async () => {} })).rejects.toThrow();
    await expect(startPracticeSearch({ call: async () => ({ data: { incidentId: "judge-u1", role: "searcher" } }), refresh: async () => {} })).rejects.toThrow();
  });
});

describe("practiceErrorMessage", () => {
  it("shows the server's own reason for its refusals", () => {
    expect(practiceErrorMessage(fbErr("functions/resource-exhausted", "One new practice search per hour. Try again later."))).toBe("One new practice search per hour. Try again later.");
    expect(practiceErrorMessage(fbErr("functions/resource-exhausted", "Practice searches are full for today. Try again tomorrow."))).toBe("Practice searches are full for today. Try again tomorrow.");
    expect(practiceErrorMessage(fbErr("functions/failed-precondition", "No practice search is available right now."))).toBe("No practice search is available right now.");
  });
  it("names a lost connection and a failed sign-in, and says something plain otherwise", () => {
    expect(practiceErrorMessage(fbErr("functions/unavailable", "x"))).toBe("No connection. Try again when the link is back.");
    // The server's own "still being set up" answer (a second start during setup, or a released copy) is retryable at once.
    expect(practiceErrorMessage(fbErr("functions/unavailable", "Your practice search is still being set up. Try again in a moment."))).toBe("Your practice search is still being set up. Try again in a moment.");
    // App Check (or the anonymous sign-in) failed: say what failed, that nothing private was sent, and what still works.
    expect(practiceErrorMessage(fbErr("functions/unauthenticated", "x"))).toBe("This browser did not pass the site's security check, so a practice search cannot start. Nothing private was sent. Reload and try again; the drill replay on this page plays without it.");
    expect(practiceErrorMessage(new Error("boom"))).toBe("The practice search could not start. Try again.");
  });
});

describe("practiceErrorMessage with the SDK's real messages", () => {
  // The Firebase SDK ends every callable error message with the HTTP status.
  it("still shows the server's sentence when the SDK appends the status", () => {
    expect(practiceErrorMessage(fbErr("functions/resource-exhausted", "One new practice search per hour. Try again later. [429]"))).toBe("One new practice search per hour. Try again later.");
    expect(practiceErrorMessage(fbErr("functions/unavailable", "Your practice search is still being set up. Try again in a moment. [503]"))).toBe("Your practice search is still being set up. Try again in a moment.");
    expect(practiceErrorMessage(fbErr("functions/unavailable", "Service Unavailable [503]"))).toBe("No connection. Try again when the link is back.");
  });
  it("names a lost connection: the SDK's status 0, or a sign-in that could not reach the network", () => {
    expect(practiceErrorMessage(fbErr("functions/internal", "internal [0]"))).toBe("No connection. Try again when the link is back.");
    expect(practiceErrorMessage(fbErr("auth/network-request-failed", "Firebase: Error (auth/network-request-failed)."))).toBe("No connection. Try again when the link is back.");
    expect(practiceErrorMessage(fbErr("functions/internal", "internal [500]"))).toBe("The practice search could not start. Try again.");
  });
  it("trusts a stable reason in the details over the exact wording", () => {
    const withReason = (code: string, message: string, reason: string) => Object.assign(fbErr(code, message), { details: { reason } });
    expect(practiceErrorMessage(withReason("functions/resource-exhausted", "One practice search an hour. [429]", "hourly_limit"))).toBe("One practice search an hour.");
    expect(practiceErrorMessage(withReason("functions/unavailable", "Still setting up. [503]", "setup_busy"))).toBe("Still setting up.");
    expect(isSettingUp(withReason("functions/unavailable", "Still setting up. [503]", "setup_busy"))).toBe(true);
    expect(isSettingUp(fbErr("functions/unavailable", "Your practice search is still being set up. Try again in a moment. [503]"))).toBe(true);
    expect(isSettingUp(fbErr("functions/unavailable", "Service Unavailable [503]"))).toBe(false);
  });
});

describe("startWithRetry", () => {
  const BUSY = () => fbErr("functions/unavailable", "Your practice search is still being set up. Try again in a moment. [503]");
  // A fake clock: each wait moves time on by exactly what was asked.
  function clock() {
    let t = 0;
    const waits: number[] = [];
    return { now: () => t, wait: async (ms: number) => { waits.push(ms); t += ms; }, waits };
  }

  it("while the server is still setting up, says so and starts again every 2.5 s until it answers", async () => {
    const c = clock();
    const said: string[] = [];
    let calls = 0;
    const id = await startWithRetry(async () => { calls++; if (calls < 3) throw BUSY(); return "judge-u1"; }, { onWaiting: (s) => said.push(s), now: c.now, wait: c.wait });
    expect(id).toBe("judge-u1");
    expect(calls).toBe(3);
    expect(c.waits).toEqual([2500, 2500]);
    expect(said).toEqual(["Your practice search is still being set up. Try again in a moment.", "Your practice search is still being set up. Try again in a moment."]);
  });

  it("stops after about 30 s and gives up with the server's answer", async () => {
    const c = clock();
    let calls = 0;
    const e = await startWithRetry(async () => { calls++; throw BUSY(); }, { onWaiting: () => {}, now: c.now, wait: c.wait }).catch((x: unknown) => x);
    expect(practiceErrorMessage(e)).toBe("Your practice search is still being set up. Try again in a moment.");
    expect(c.now()).toBeLessThanOrEqual(30_000);
    expect(calls).toBe(13);
  });

  it("does not retry a lost connection or anything else", async () => {
    const c = clock();
    let calls = 0;
    const said: string[] = [];
    const e = await startWithRetry(async () => { calls++; throw fbErr("functions/unavailable", "Service Unavailable [503]"); }, { onWaiting: (s) => said.push(s), now: c.now, wait: c.wait }).catch((x: unknown) => x);
    expect(practiceErrorMessage(e)).toBe("No connection. Try again when the link is back.");
    expect(calls).toBe(1);
    expect(said).toEqual([]);
  });
});

describe("practice search on a copy with no Firebase settings", () => {
  it("names the cause instead of asking to try again", () => {
    let thrown: unknown;
    try {
      readEnv({});
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(MissingConfigError);
    expect(practiceErrorMessage(thrown)).toBe("This copy has no Firebase settings, so it cannot start a practice search. Use the live site.");
  });
});
