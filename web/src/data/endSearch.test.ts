import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { END_REASONS, endedLine, endSearchPatch } from "./endSearch";

describe("ending a search", () => {
  it("writes the close and its reason, nothing else", () => {
    expect(endSearchPatch("training_ended")).toEqual({ status: "closed", closedReason: "training_ended" });
  });
  it("offers exactly the reasons the rules accept", () => {
    const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");
    const list = rules.match(/closedReason in \[([^\]]*)\]/)?.[1] ?? "";
    expect(END_REASONS.map((r) => r.value)).toEqual([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  });
  it("says nothing until the server has the close (a pending local write is not an ended search)", () => {
    expect(endedLine("closed", "found", false)).toBeNull();
    expect(endedLine("closed", "found", true)).toBe("Search ended: person found. No new reports are taken.");
  });
  it("says the search ended and why, only once it is closed", () => {
    expect(endedLine("open", undefined)).toBeNull();
    expect(endedLine("found", undefined)).toBeNull();
    expect(endedLine("closed", "found")).toBe("Search ended: person found. No new reports are taken.");
    expect(endedLine("closed", "suspended")).toBe("Search ended: search suspended. No new reports are taken.");
    expect(endedLine("closed", "training_ended")).toBe("Search ended: training ended. No new reports are taken.");
    expect(endedLine("closed", undefined)).toBe("Search ended. No new reports are taken.");
    expect(endedLine("closed", "lost")).toBe("Search ended. No new reports are taken.");
  });
});

describe("confirmedStatus: the status the server last confirmed", () => {
  it("follows the server and ignores this browser's pending writes, so a later pending edit never un-ends a search", async () => {
    const { confirmedStatus } = await import("./endSearch");
    expect(confirmedStatus(undefined, "open", false)).toBe("open");
    expect(confirmedStatus("open", "closed", true)).toBe("open");
    expect(confirmedStatus("open", "closed", false)).toBe("closed");
    expect(confirmedStatus("closed", "closed", true)).toBe("closed");
  });
});
