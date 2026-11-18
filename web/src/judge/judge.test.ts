import { describe, expect, it } from "vitest";
import { d2Copy, loadPublishedRun } from "./judge";

describe("d2Copy", () => {
  it("(a) no built-in model: nothing private was sent, use the cloud replay", () => {
    expect(d2Copy("no-model")).toEqual({ lines: ["This browser has no built-in model. Nothing private was sent. Use the replay above, which runs in the cloud."], photoButton: null });
  });

  it("(b) text only: the note is read here and photos stay unread", () => {
    expect(d2Copy("text")).toEqual({
      lines: ["The sighting note is read on this laptop.", "This browser's model cannot read images. Photos stayed on this laptop."],
      photoButton: null,
    });
  });

  it("(c) image input: sample photos too", () => {
    expect(d2Copy("image")).toEqual({ lines: ["The sighting note and sample photos are read on this laptop."], photoButton: "Read sample photos on this laptop" });
  });

  it("downloadable: says the model can be downloaded first", () => {
    expect(d2Copy("downloadable").lines[0]).toMatch(/download/);
    expect(d2Copy("downloadable").photoButton).toBeNull();
  });
});

describe("loadPublishedRun", () => {
  const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const run = { runId: "r1", label: "Training drill", exportedAt: "2026-11-22T20:00:00Z", incident: {}, segments: [], teams: [], devices: [], events: [], plans: [], measurements: [] };

  it("says there is no published run on a 404", async () => {
    expect(await loadPublishedRun(async () => new Response("", { status: 404 }))).toEqual({ state: "none" });
  });

  it("returns a run that has every required part", async () => {
    expect(await loadPublishedRun(ok(run))).toEqual({ state: "run", run });
  });

  it("refuses a file that is missing a part or is not JSON, rather than show wrong numbers", async () => {
    const { measurements: _m, ...partial } = run;
    expect(await loadPublishedRun(ok(partial))).toEqual({ state: "invalid" });
    expect(await loadPublishedRun(async () => new Response("not json", { status: 200 }))).toEqual({ state: "invalid" });
  });

  it("treats the app's own HTML (the hosting rewrite for a missing file) as no run", async () => {
    const html = async () => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    expect(await loadPublishedRun(html)).toEqual({ state: "none" });
  });

  it("reports an unreachable file as unavailable, not as no run", async () => {
    expect(await loadPublishedRun(async () => { throw new TypeError("Failed to fetch"); })).toEqual({ state: "unavailable" });
  });
});
