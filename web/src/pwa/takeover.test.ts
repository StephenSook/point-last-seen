import { describe, expect, it } from "vitest";
import { hasUnsavedText, watchForNewBuild } from "./takeover";

function fakeSw(controller: object | null) {
  const listeners: (() => void)[] = [];
  return {
    controller,
    addEventListener: (type: string, fn: () => void) => { if (type === "controllerchange") listeners.push(fn); },
    fire: () => listeners.forEach((fn) => fn()),
  };
}

describe("watchForNewBuild", () => {
  it("reloads once when a new build's worker takes over a page the old one was serving", () => {
    const sw = fakeSw({});
    let reloads = 0;
    watchForNewBuild({ sw, reload: () => reloads++, unsaved: () => false, ask: () => { throw new Error("asked"); } });
    sw.fire();
    sw.fire();
    expect(reloads).toBe(1);
  });

  it("asks instead of reloading while a field holds typed words", () => {
    const sw = fakeSw({});
    let reloads = 0;
    let asks = 0;
    watchForNewBuild({ sw, reload: () => reloads++, unsaved: () => true, ask: () => asks++ });
    sw.fire();
    expect([reloads, asks]).toEqual([0, 1]);
  });

  it("does nothing on a first visit, where the page already runs the newest build", () => {
    const sw = fakeSw(null);
    let reloads = 0;
    watchForNewBuild({ sw, reload: () => reloads++, unsaved: () => false, ask: () => reloads++ });
    sw.fire();
    expect(reloads).toBe(0);
  });

  it("does nothing where the browser has no service workers", () => {
    expect(() => watchForNewBuild({ sw: undefined, reload: () => {}, unsaved: () => false, ask: () => {} })).not.toThrow();
  });
});

describe("hasUnsavedText", () => {
  it("is true only when a text field holds non-blank words", () => {
    expect(hasUnsavedText([{ type: "text", value: "" }, { type: "textarea", value: "  " }])).toBe(false);
    expect(hasUnsavedText([{ type: "textarea", value: "red jacket" }])).toBe(true);
    expect(hasUnsavedText([{ type: "search", value: "BO" }])).toBe(true);
    // Choices and files are kept by the page's own state or are re-picked in a moment; only typed words count.
    expect(hasUnsavedText([{ type: "checkbox", value: "on" }, { type: "file", value: "C:\\fakepath\\a.jpg" }, { type: "hidden", value: "x" }])).toBe(false);
  });
});
