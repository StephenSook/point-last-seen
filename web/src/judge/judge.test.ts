import { describe, expect, it } from "vitest";
import { harnessRun } from "../extras/testdata/replayIncident";
import { ADVICE_LINE, ANDROID_RELEASE_URL, TESTFLIGHT_URL, d2Copy, fetchedTime, judgeLinks, loadPublishedRun, modelLines } from "./judge";

describe("d2Copy", () => {
  it("(a) no built-in model: nothing private was sent, and the replay is named only when it exists", () => {
    expect(d2Copy("no-model", { replay: true })).toEqual({ lines: ["This browser has no built-in model. Nothing private was sent. The replay above shows a recorded drill run."] });
    expect(d2Copy("no-model", { replay: false })).toEqual({ lines: ["This browser has no built-in model. Nothing private was sent."] });
  });

  it("says a failed download plainly", () => {
    expect(d2Copy("downloadable", { replay: false, downloadFailed: true }).lines).toEqual(["This browser could not download its built-in model. Nothing private was sent."]);
  });

  // The check only asks Chrome what the model can take; it reads nothing, so the lines say "ready", never "read".
  // A practice search has no photos and the page shows none, so no line names sample photos.
  it("(b) text only: the model is ready for the note and cannot read photos", () => {
    expect(d2Copy("text", { replay: false })).toEqual({ lines: ["The built-in model on this laptop is ready for the sighting note.", "It cannot read photos on this laptop."] });
  });

  it("(c) image input: ready for the note and photos", () => {
    expect(d2Copy("image", { replay: false })).toEqual({ lines: ["The built-in model on this laptop is ready for the sighting note and photos."] });
  });

  it("downloadable: says the model can be downloaded first", () => {
    expect(d2Copy("downloadable", { replay: false }).lines[0]).toMatch(/download/);
  });

  it("no line names sample photos", () => {
    for (const state of ["no-model", "downloadable", "text", "image"] as const) {
      for (const line of d2Copy(state, { replay: true }).lines) expect(line).not.toMatch(/sample photo/i);
    }
  });
});

describe("loadPublishedRun", () => {
  const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  // Made-up run data (the replay harness's), read by the same reader the replay uses.
  const run = harnessRun();

  it("says there is no published run on a 404", async () => {
    expect(await loadPublishedRun(async () => new Response("", { status: 404 }))).toEqual({ state: "none" });
  });

  it("returns a run the replay reader accepts", async () => {
    expect(await loadPublishedRun(ok(run))).toEqual({ state: "run", run });
  });

  it("names why the replay reader refuses a run, rather than show it or call it missing", async () => {
    const broken = { ...run, events: run.events.map((e, i) => (i === 0 ? { ...e, serverTimeMs: undefined } : e)) };
    expect(await loadPublishedRun(ok(broken))).toEqual({ state: "refused", run: JSON.parse(JSON.stringify(broken)), reason: "The run has no arrival time for a report." });
    const { events: _e, ...noReports } = run;
    expect(await loadPublishedRun(ok(noReports))).toMatchObject({ state: "refused" });
  });

  it("calls a file that is not a JSON object unreadable", async () => {
    expect(await loadPublishedRun(async () => new Response("not json", { status: 200 }))).toEqual({ state: "invalid" });
    expect(await loadPublishedRun(ok([1, 2]))).toEqual({ state: "invalid" });
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

describe("fetchedTime", () => {
  it("gives the Remote Config fetch time with its time zone", () => {
    expect(fetchedTime(Date.UTC(2026, 10, 18, 19, 5, 9), "America/New_York")).toBe("14:05:09 EST");
    expect(fetchedTime(Date.UTC(2026, 10, 18, 19, 5, 9), "UTC")).toBe("19:05:09 UTC");
  });
});

describe("ADVICE_LINE", () => {
  // What she told us, in our words: credited as her advice, never as an endorsement, and never in quote marks,
  // because nothing here is a word-for-word quote.
  it("credits Kim Franklin as advice, paraphrased with no quote marks", () => {
    expect(ADVICE_LINE).toMatch(/^Kim Franklin of the Alzheimer's Association Georgia told us /);
    expect(ADVICE_LINE).toContain("within five minutes, call police, because the longer you wait, the further they can get.");
    expect(ADVICE_LINE).not.toContain('"');
    expect(ADVICE_LINE).not.toMatch(/endorse|recommends|approved/i);
  });

  it("uses plain ASCII punctuation only", () => {
    expect(ADVICE_LINE).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("judgeLinks", () => {
  const REPO = "https://github.com/StephenSook/point-last-seen";
  it("links the command post, the source, the iPhone's recorded runs and the test matrix, all public", () => {
    const links = judgeLinks({ android: null, testflight: null });
    expect(links).toEqual([
      { label: "Command post", href: "/", external: false },
      { label: "Source code", href: REPO, external: true },
      { label: "iPhone test runs", href: `${REPO}/tree/main/docs/evidence/ios`, external: true },
      { label: "Which model ran where", href: `${REPO}/blob/main/docs/TEST-MATRIX.md`, external: true },
    ]);
  });
  it("adds the Android app and the TestFlight link only when each URL is set", () => {
    const labels = judgeLinks({ android: `${REPO}/releases/tag/android-judge`, testflight: "https://testflight.apple.com/join/x" }).map(l => l.label);
    expect(labels).toEqual(["Command post", "Source code", "Android family app", "iPhone app (TestFlight)", "iPhone test runs", "Which model ran where"]);
  });
  it("links the latest published Android judge release, so a new judge build needs no code change", () => {
    expect(ANDROID_RELEASE_URL).toBe(`${REPO}/releases/latest`);
    expect(judgeLinks({ android: ANDROID_RELEASE_URL, testflight: TESTFLIGHT_URL }).find(l => l.label === "Android family app")?.href).toBe(ANDROID_RELEASE_URL);
  });
  it("ships no TestFlight link until Apple clears review", () => {
    expect(TESTFLIGHT_URL).toBeNull();
    expect(judgeLinks({ android: ANDROID_RELEASE_URL, testflight: TESTFLIGHT_URL }).some(l => l.label.includes("TestFlight"))).toBe(false);
  });
});

