import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { getFunctions, httpsCallableFromURL } from "firebase/functions";
import { callableError } from "./callableError";

const SETUP = "Your practice search is still being set up. Try again in a moment.";
let n = 0;

// Runs a real callable through the Firebase SDK against a stubbed reply, so the error is exactly what the app sees.
async function sdkError(status: number, error: unknown): Promise<unknown> {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } }));
  const app = initializeApp({ projectId: "demo-test", apiKey: "test", appId: "1:1:web:1" }, `callable-${++n}`);
  try {
    await httpsCallableFromURL(getFunctions(app), "https://callable.invalid/fn")({});
    return new Error("the call did not fail");
  } catch (e) {
    return e;
  } finally {
    await deleteApp(app);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("callableError", () => {
  it("gives the server's sentence without the status the SDK appends", async () => {
    const e = await sdkError(503, { status: "UNAVAILABLE", message: SETUP });
    expect((e as Error).message).toBe(`${SETUP} [503]`);
    expect(callableError(e)).toEqual({ code: "functions/unavailable", message: SETUP, reason: null, status: 503 });
  });

  it("reads a stable reason from the error's details", async () => {
    const e = await sdkError(429, { status: "RESOURCE_EXHAUSTED", message: "One new practice search per hour. Try again later.", details: { reason: "hourly_limit" } });
    expect(callableError(e)).toEqual({ code: "functions/resource-exhausted", message: "One new practice search per hour. Try again later.", reason: "hourly_limit", status: 429 });
  });

  it("gives status 0 when the request never reached the server", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    const app = initializeApp({ projectId: "demo-test", apiKey: "test", appId: "1:1:web:1" }, `callable-${++n}`);
    const e = await httpsCallableFromURL(getFunctions(app), "https://callable.invalid/fn")({}).catch((x: unknown) => x);
    await deleteApp(app);
    expect(callableError(e)).toEqual({ code: "functions/internal", message: "internal", reason: null, status: 0 });
  });

  it("leaves other errors' messages as they are", () => {
    expect(callableError(new Error("boom [503]"))).toEqual({ code: "", message: "boom [503]", reason: null, status: null });
    expect(callableError(Object.assign(new Error("Sign in [first] please"), { code: "functions/unauthenticated" }))).toEqual({ code: "functions/unauthenticated", message: "Sign in [first] please", reason: null, status: null });
    expect(callableError("not an error")).toEqual({ code: "", message: "", reason: null, status: null });
  });
});
