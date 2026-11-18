import { describe, expect, it } from "vitest";
import { d2Copy, loadPublishedRun, modelLines } from "./judge";

describe("d2Copy", () => {
  it("(a) no built-in model: nothing private was sent, and the cloud replay is named only when it exists", () => {
    expect(d2Copy("no-model", { replay: true })).toEqual({ lines: ["This browser has no built-in model. Nothing private was sent. Use the replay above, which runs in the cloud."], photoButton: null });
    expect(d2Copy("no-model", { replay: false })).toEqual({ lines: ["This browser has no built-in model. Nothing private was sent."], photoButton: null });
  });

  it("says a failed download plainly", () => {
    expect(d2Copy("downloadable", { replay: false, downloadFailed: true }).lines).toEqual(["This browser could not download its built-in model. Nothing private was sent."]);
  });

  it("(b) text only: the note is read here and photos stay unread", () => {
    expect(d2Copy("text", { replay: false })).toEqual({
      lines: ["The sighting note is read on this laptop.", "This browser's model cannot read images. Photos stayed on this laptop."],
      photoButton: null,
    });
  });

  it("(c) image input: sample photos too", () => {
    expect(d2Copy("image", { replay: false })).toEqual({ lines: ["The sighting note and sample photos are read on this laptop."], photoButton: "Read sample photos on this laptop" });
  });

  it("downloadable: says the model can be downloaded first", () => {
    expect(d2Copy("downloadable", { replay: false }).lines[0]).toMatch(/download/);
    expect(d2Copy("downloadable", { replay: false }).photoButton).toBeNull();
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

describe("modelLines", () => {
  it("names the model Remote Config chose and when it was fetched", () => {
    expect(modelLines({ cloudModelWeb: "gemini-3.6-flash-lite", cloudModelSource: "remote", fetchedAt: "14:05:09", killCloud: false })).toEqual([
      "Cloud model now: gemini-3.6-flash-lite.",
      "Chosen by Remote Config (fetched 14:05:09), so it can change live with no new release.",
    ]);
  });

  it("labels the pinned default when Remote Config answered with no value", () => {
    expect(modelLines({ cloudModelWeb: "gemini-3.5-flash-lite", cloudModelSource: "default", fetchedAt: "14:05:09", killCloud: false })).toEqual([
      "Cloud model now: gemini-3.5-flash-lite (default).",
      "Remote Config answered at 14:05:09 with no value set, so this is the page's pinned default.",
    ]);
  });

  it("labels the pinned default when Remote Config has not answered", () => {
    expect(modelLines({ cloudModelWeb: "gemini-3.5-flash-lite", cloudModelSource: "default", fetchedAt: null, killCloud: false })).toEqual([
      "Cloud model now: gemini-3.5-flash-lite (default).",
      "Remote Config has not answered, so this is the page's pinned default.",
    ]);
  });

  it("says when command has paused cloud steps", () => {
    expect(modelLines({ cloudModelWeb: "gemini-3.5-flash-lite", cloudModelSource: "remote", fetchedAt: "14:05:09", killCloud: true })).toContain("Cloud steps are paused by command.");
  });
});
