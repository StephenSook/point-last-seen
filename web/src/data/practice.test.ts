import { describe, expect, it } from "vitest";
import { isSettingUp, practiceErrorMessage, startPracticeSearch } from "./practice";
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
    expect(practiceErrorMessage(fbErr("functions/unauthenticated", "x"))).toBe("This browser could not be checked. Reload and try again.");
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
  it("trusts a stable reason in the details over the exact wording", () => {
    const withReason = (code: string, message: string, reason: string) => Object.assign(fbErr(code, message), { details: { reason } });
    expect(practiceErrorMessage(withReason("functions/resource-exhausted", "One practice search an hour. [429]", "hourly_limit"))).toBe("One practice search an hour.");
    expect(practiceErrorMessage(withReason("functions/unavailable", "Still setting up. [503]", "setup_busy"))).toBe("Still setting up.");
    expect(isSettingUp(withReason("functions/unavailable", "Still setting up. [503]", "setup_busy"))).toBe(true);
    expect(isSettingUp(fbErr("functions/unavailable", "Your practice search is still being set up. Try again in a moment. [503]"))).toBe(true);
    expect(isSettingUp(fbErr("functions/unavailable", "Service Unavailable [503]"))).toBe(false);
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
