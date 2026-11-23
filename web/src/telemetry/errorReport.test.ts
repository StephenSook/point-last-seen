import type { FirebaseApp } from "firebase/app";
import { describe, expect, it, vi } from "vitest";
import { safeErrorReport, startErrorReports, type CrashlyticsApi } from "./errorReport";

const ORIGIN = "https://pls.example";
const NOTE = "red jacket by the creek, call 404-555-0100";

// A V8 stack: the message (here two lines of user text) heads the stack, then the frames.
function v8Error(message: string, frames: string[]): Error {
  const e = new Error(message);
  e.stack = [`Error: ${message}`, ...frames].join("\n");
  return e;
}

describe("safeErrorReport", () => {
  it("never carries the error's message, even when the message is user text", () => {
    const r = safeErrorReport(v8Error(NOTE, [`    at readNote (${ORIGIN}/assets/main-abc.js:1:2345)`]), ORIGIN);
    expect(JSON.stringify(r)).not.toContain("red jacket");
    expect(JSON.stringify(r)).not.toContain("404-555");
    expect(r?.message).toBe("message removed");
    expect(r?.stack).toBe(`Error: message removed\n    at readNote (${ORIGIN}/assets/main-abc.js:1:2345)`);
  });

  it("keeps only frames on this site, so a message line shaped like a frame is still dropped", () => {
    const e = v8Error(`${NOTE}\n    at creek (https://elsewhere.example/x.js:1:2)`, [
      `    at async Promise.all (index 0)`,
      `    at new Plan (${ORIGIN}/assets/main-abc.js:3:4)`,
      `    at Object.run [as go] (blob:${ORIGIN}/0c5e-11aa:5:6)`,
      `    at grecaptcha (https://www.gstatic.com/recaptcha/x.js:7:8)`,
    ]);
    const r = safeErrorReport(e, ORIGIN);
    expect(r?.stack).toBe([`Error: message removed`, `    at new Plan (${ORIGIN}/assets/main-abc.js:3:4)`, `    at Object.run [as go] (blob:${ORIGIN}/0c5e-11aa:5:6)`].join("\n"));
  });

  it("drops a message line shaped like a frame on this site, in either browser's shape", () => {
    const fake = [`    at creek (${ORIGIN}/assets/main-abc.js:9:9)`, `red jacket@${ORIGIN}/assets/main-abc.js:8:8`];
    const real = `    at readNote (${ORIGIN}/assets/main-abc.js:1:2)`;
    for (const line of fake) {
      // The message ends with the fake line, so it sits right above the real frames.
      const r = safeErrorReport(v8Error(`${NOTE}\n${line}`, [real]), ORIGIN);
      expect(r?.stack).toBe(`Error: message removed\n${real}`);
      // The same when the message was changed after the stack was taken (its first line no longer matches).
      const e = v8Error(`${NOTE}\n${line}`, [real]);
      e.message = `${e.message} (more)`;
      expect(safeErrorReport(e, ORIGIN)?.stack).toBe(`Error: message removed\n${real}`);
    }
  });

  it("matches a Firefox frame only by a code-shaped function name", () => {
    const e = new Error("x");
    e.stack = [`red jacket by the creek@${ORIGIN}/assets/main-abc.js:1:1`, `async*plan/<@${ORIGIN}/assets/main-abc.js:2:2`, `module code@${ORIGIN}/assets/main-abc.js:3:3`].join("\n");
    expect(safeErrorReport(e, ORIGIN)?.stack).toBe([`async*plan/<@${ORIGIN}/assets/main-abc.js:2:2`, `module code@${ORIGIN}/assets/main-abc.js:3:3`].join("\n"));
  });

  it("reads Firefox and Safari frames, and strips a query or fragment from a frame's address", () => {
    const e = new Error(NOTE);
    e.stack = [`plan/<@${ORIGIN}/assets/main-abc.js?v=2:10:11`, `global code@${ORIGIN}/?join=ABCD12#x:1:1`, `promiseReactionJob@[native code]`].join("\n");
    const r = safeErrorReport(e, ORIGIN);
    expect(r?.stack).toBe([`plan/<@${ORIGIN}/assets/main-abc.js:10:11`, `global code@${ORIGIN}/:1:1`].join("\n"));
    expect(JSON.stringify(r)).not.toContain("ABCD12");
  });

  it("keeps a Firebase error code and an HTTP status, which are fixed words from the SDK", () => {
    const fs = Object.assign(new Error(`No document to update: drills/x/${NOTE}`), { name: "FirebaseError", code: "firestore/not-found" });
    expect(safeErrorReport(fs, ORIGIN)).toMatchObject({ name: "FirebaseError", message: "message removed; code firestore/not-found" });
    const ai = Object.assign(new Error(NOTE), { name: "FirebaseError", code: "AI/fetch-error", customErrorData: { status: 429 } });
    expect(safeErrorReport(ai, ORIGIN)?.message).toBe("message removed; code AI/fetch-error; status 429");
  });

  it("drops a code or a name that is not a plain identifier", () => {
    const e = Object.assign(new Error("x"), { name: "red jacket", code: "red jacket by the creek" });
    expect(safeErrorReport(e, ORIGIN)).toMatchObject({ name: "Error", message: "message removed" });
  });

  it("reports a thrown non-error by its type only", () => {
    expect(safeErrorReport(NOTE, ORIGIN)).toEqual({ name: "Error", message: "non-error value thrown (string)", stack: "" });
    expect(safeErrorReport({ note: NOTE }, ORIGIN)).toEqual({ name: "Error", message: "non-error value thrown (object)", stack: "" });
    expect(safeErrorReport(undefined, ORIGIN)).toBeNull();
    expect(safeErrorReport(null, ORIGIN)).toBeNull();
  });

  it("caps the frames it keeps", () => {
    const frames = Array.from({ length: 100 }, (_, i) => `    at f${i} (${ORIGIN}/assets/main-abc.js:${i}:1)`);
    expect(safeErrorReport(v8Error("x", frames), ORIGIN)?.stack.split("\n")).toHaveLength(41);
  });
});

function fakeTarget() {
  const target = new EventTarget();
  const raise = (error: unknown) => target.dispatchEvent(Object.assign(new Event("error"), { error }));
  const reject = (reason: unknown) => target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
  return { target, raise, reject };
}

function fakeCrashlytics() {
  const recorded: Error[] = [];
  const instance = { app: {} as FirebaseApp };
  const api: CrashlyticsApi = {
    getCrashlytics: vi.fn(() => instance),
    recordError: vi.fn((_c, e: unknown) => void recorded.push(e as Error)),
  };
  return { api, recorded, instance };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const APP = { name: "[DEFAULT]" } as FirebaseApp;

describe("startErrorReports", () => {
  it("loads nothing until an error happens, then sends it without its message", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn(async () => api);
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: "a".repeat(40) });
    await settle();
    expect(load).not.toHaveBeenCalled();

    raise(v8Error(NOTE, [`    at readNote (${ORIGIN}/assets/main-abc.js:1:2)`]));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(api.getCrashlytics).toHaveBeenCalledWith(APP, { appVersion: "a".repeat(40), captureUnhandledErrors: false });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toBeInstanceOf(Error);
    expect(recorded[0]?.message).toBe("message removed");
    expect(recorded[0]?.stack).toBe(`Error: message removed\n    at readNote (${ORIGIN}/assets/main-abc.js:1:2)`);
    expect(JSON.stringify([recorded[0]?.name, recorded[0]?.message, recorded[0]?.stack])).not.toContain("red jacket");
  });

  it("reports an unhandled rejection the same way", async () => {
    const { target, reject } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load: async () => api, appVersion: undefined });
    reject(Object.assign(new Error(NOTE), { name: "FirebaseError", code: "storage/unauthorized" }));
    await settle();
    expect(api.getCrashlytics).toHaveBeenCalledWith(APP, { captureUnhandledErrors: false });
    expect(recorded.map((e) => [e.name, e.message])).toEqual([["FirebaseError", "message removed; code storage/unauthorized"]]);
  });

  it("sends one report per distinct error and at most five a page", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load: async () => api, appVersion: undefined });
    const at = (i: number) => v8Error("x", [`    at f (${ORIGIN}/assets/main-abc.js:${i}:1)`]);
    raise(at(1));
    raise(at(1));
    for (let i = 2; i <= 9; i++) raise(at(i));
    await settle();
    expect(recorded.map((e) => e.stack?.split(":").at(-2))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("skips an error event with no error object (a cross-origin script error)", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: undefined });
    raise(null);
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("sends nothing before Firebase has started, and never starts Firebase itself", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    startErrorReports({ target, origin: ORIGIN, app: () => undefined, load, appVersion: undefined });
    raise(new Error("x"));
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("never throws when the SDK cannot load, and tries again on the next error", async () => {
    const { target, raise } = fakeTarget();
    const { api, recorded } = fakeCrashlytics();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(api);
    startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: undefined });
    expect(() => raise(v8Error("x", [`    at f (${ORIGIN}/a.js:1:1)`]))).not.toThrow();
    await settle();
    raise(v8Error("y", [`    at g (${ORIGIN}/a.js:2:1)`]));
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(recorded).toHaveLength(1);
  });

  it("stops listening when stopped", async () => {
    const { target, raise } = fakeTarget();
    const load = vi.fn(async () => fakeCrashlytics().api);
    const stop = startErrorReports({ target, origin: ORIGIN, app: () => APP, load, appVersion: undefined });
    stop();
    raise(new Error("x"));
    await settle();
    expect(load).not.toHaveBeenCalled();
  });
});
