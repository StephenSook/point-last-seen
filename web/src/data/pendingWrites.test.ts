import { describe, expect, it } from "vitest";
import { guardLeave, savingLine, unansweredIds, writeNotice } from "./pendingWrites";

describe("unansweredIds", () => {
  it("lists writes the server has not answered yet: pending or being checked", () => {
    expect(unansweredIds({ a: { state: "pending" }, b: { state: "checking" }, c: { state: "acked" }, d: { state: "rejected" } })).toEqual(["a", "b"]);
    expect(unansweredIds({})).toEqual([]);
  });
});

describe("writeNotice", () => {
  it("says nothing and lets the page close when every write is answered", () => {
    expect(writeNotice([], new Set(), true)).toBeNull();
    expect(writeNotice([], new Set(), false)).toBeNull();
  });

  it("online: says it is saving and asks before the page closes, until the server answers", () => {
    expect(writeNotice(["a"], new Set(["a"]), true)).toEqual({ line: "Saving one report. Keep this page open.", ask: true });
  });

  it("offline, once this browser has stored the report: says so, and lets the page close", () => {
    expect(writeNotice(["a"], new Set(["a"]), false)).toEqual({ line: "Saved in this browser. It sends when you're back online.", ask: false });
    expect(writeNotice(["a", "b"], new Set(["a", "b"]), false)).toEqual({ line: "2 reports saved in this browser. They send when you're back online.", ask: false });
  });

  it("offline, before this browser has stored every report: still saving, still asks", () => {
    expect(writeNotice(["a", "b"], new Set(["a"]), false)).toEqual({ line: "Saving 2 reports. Keep this page open.", ask: true });
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
