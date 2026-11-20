import { describe, expect, it } from "vitest";
import { guardLeave, pendingCount, savingLine } from "./pendingWrites";

describe("pendingCount", () => {
  it("counts writes the server has not answered yet: pending or being checked", () => {
    expect(pendingCount({ a: { state: "pending" }, b: { state: "checking" }, c: { state: "acked" }, d: { state: "rejected" } })).toBe(2);
    expect(pendingCount({})).toBe(0);
  });
});

describe("savingLine", () => {
  it("says nothing when every write is answered", () => {
    expect(savingLine(0)).toBeNull();
  });

  it("names how many reports are still being saved and asks to keep the page open", () => {
    expect(savingLine(1)).toBe("Saving one report. Keep this page open.");
    expect(savingLine(3)).toBe("Saving 3 reports. Keep this page open.");
  });
});

describe("guardLeave", () => {
  const leave = () => new Event("beforeunload", { cancelable: true });

  it("asks before the page closes while a write is unanswered", () => {
    const target = new EventTarget();
    const stop = guardLeave(target, true);
    const e = leave();
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    stop();
  });

  it("lets the page close when nothing is pending, and after the guard is stopped", () => {
    const target = new EventTarget();
    const idle = leave();
    guardLeave(target, false)();
    target.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    const stop = guardLeave(target, true);
    stop();
    const after = leave();
    target.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
