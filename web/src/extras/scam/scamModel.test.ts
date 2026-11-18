import { describe, expect, it } from "vitest";
import { scamFixture, scamClipFixture } from "../testdata/scam";
import { SCAM_LIMITS, loadScam, missLine, parseScam, recomputePass, type ScamClip } from "./scamModel";

const clip = (over: Partial<ScamClip> = {}) => {
  const c = scamClipFixture(over);
  const { pass: _p, missReasons: _m, ...errors } = c;
  return errors;
};

describe("recomputePass", () => {
  it("a clip inside both limits passes; 121 seconds misses on time; 46 degrees misses on bearing", () => {
    expect(SCAM_LIMITS).toEqual({ timeS: 120, bearingDeg: 45 });
    expect(recomputePass(clip({ timeErrorS: 120, bearingErrorDeg: 45 }))).toEqual({ pass: true, missReasons: [] });
    expect(recomputePass(clip({ timeErrorS: 121, bearingErrorDeg: 10 }))).toEqual({ pass: false, missReasons: ["time"] });
    expect(recomputePass(clip({ timeErrorS: 10, bearingErrorDeg: 46 }))).toEqual({ pass: false, missReasons: ["bearing"] });
    expect(recomputePass(clip({ timeErrorS: -130, bearingErrorDeg: -50 }))).toEqual({ pass: false, missReasons: ["time", "bearing"] });
  });

  it("a night clip that names a color misses on night_color", () => {
    expect(recomputePass(clip({ id: "night-1", lighting: "night_ir", nightColorsUnknown: false }))).toEqual({ pass: false, missReasons: ["night_color"] });
    expect(recomputePass(clip({ id: "night-1", lighting: "night_ir", nightColorsUnknown: true })).pass).toBe(true);
    // A night clip whose color answer was not recorded cannot be shown to pass, and is not said to have named a color.
    expect(recomputePass(clip({ id: "night-1", lighting: "low_light", nightColorsUnknown: null })).missReasons).toEqual(["night_color_not_recorded"]);
  });

  it("a clip with no reading misses as not_read", () => {
    expect(recomputePass(clip({ timeErrorS: null, bearingErrorDeg: null }))).toEqual({ pass: false, missReasons: ["not_read"] });
  });
});

describe("parseScam", () => {
  it("reads a file whose verdicts match their errors", () => {
    const r = parseScam(scamFixture());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({ runAt: "2026-11-18T21:00:00Z", n: 6, passed: 5, gatePassed: true, clipSource: "staged" });
    expect(r.result.clips).toHaveLength(6);
  });

  it("a file whose stored verdict differs from the recomputed one is refused", () => {
    const f = scamFixture();
    f.clips[1] = { ...f.clips[1]!, pass: true, missReasons: [] };
    f.passed = 6;
    expect(parseScam(f)).toEqual({ ok: false, reason: "The stored verdict for clip night-2 does not match its errors." });
  });

  it("a file whose passed count or n does not match its clips is refused", () => {
    expect(parseScam({ ...scamFixture(), passed: 6 })).toEqual({ ok: false, reason: "The passed count does not match the clips." });
    expect(parseScam({ ...scamFixture(), n: 7 })).toEqual({ ok: false, reason: "The clip count does not match the clips." });
  });

  it("gatePassed is true only when at least 5 of 6 clips pass and no night clip misses on night_color", () => {
    const f = scamFixture();
    expect(parseScam(f)).toMatchObject({ ok: true, result: { passed: 5, gatePassed: true } });
    // 5 of 6 pass, so the count rule holds: the only miss is a night clip's color answer, which alone must fail the gate.
    const onlyNight = (night1: Partial<ScamClip>) =>
      f.clips
        .map((c) => (c.id === "night-2" ? { ...c, bearingErrorDeg: 10, pass: true, missReasons: [] } : c))
        .map((c) => (c.id === "night-1" ? { ...c, pass: false, ...night1 } : c));
    for (const night1 of [
      { nightColorsUnknown: false, missReasons: ["night_color" as const] },
      { nightColorsUnknown: null, missReasons: ["night_color_not_recorded" as const] },
    ]) {
      const r = parseScam({ ...f, clips: onlyNight(night1), passed: 5 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.result.passed).toBe(5);
      expect(r.result.gatePassed).toBe(false);
    }
    // And the count rule alone: 4 of 6 with no night miss.
    const four = parseScam({ ...f, clips: f.clips.map((c) => (c.id === "day-1" ? { ...c, timeErrorS: 500, pass: false, missReasons: ["time" as const] } : c)), passed: 4 });
    expect(four).toMatchObject({ ok: true, result: { passed: 4, gatePassed: false } });
  });

  it("refuses a file that does not say where its clips came from, or carries a field outside the allowlist", () => {
    const { clipSource: _s, ...noSource } = scamFixture();
    expect(parseScam(noSource)).toEqual({ ok: false, reason: "The file does not say where the clips came from." });
    const f = scamFixture();
    expect(parseScam({ ...f, clips: [{ ...f.clips[0]!, fileName: "IMG_0412.mov" }, ...f.clips.slice(1)] })).toEqual({
      ok: false,
      reason: "Clip night-1 carries a field this page does not publish: fileName.",
    });
  });
});

describe("missLine", () => {
  it("missLine names the clip, the error and the limit", () => {
    expect(missLine(scamClipFixture({ id: "night-2", lighting: "night_ir", bearingErrorDeg: 90, pass: false, missReasons: ["bearing"] }))).toBe(
      "Night clip 2: direction off by 90 degrees (limit 45).",
    );
    expect(missLine(scamClipFixture({ id: "day-1", timeErrorS: 150, bearingErrorDeg: 60, pass: false, missReasons: ["time", "bearing"] }))).toBe(
      "Day clip 1: last-seen time off by 150 s (limit 120); direction off by 60 degrees (limit 45).",
    );
    expect(missLine(scamClipFixture({ id: "night-3", lighting: "night_ir", nightColorsUnknown: false, pass: false, missReasons: ["night_color"] }))).toBe(
      "Night clip 3: named a color it could not see at night.",
    );
    expect(missLine(scamClipFixture({ id: "day-2", timeErrorS: null, bearingErrorDeg: null, pass: false, missReasons: ["not_read"] }))).toBe("Day clip 2: not read.");
    expect(missLine(scamClipFixture({ id: "night-1", lighting: "low_light", nightColorsUnknown: null, pass: false, missReasons: ["night_color_not_recorded"] }))).toBe(
      "Night clip 1: whether it named colors at night was not recorded.",
    );
  });
});

describe("loadScam", () => {
  const respond = (body: string, status = 200, type = "application/json") => async () => new Response(body, { status, headers: { "content-type": type } });

  it("HTML served with status 200 is none, not a result", async () => {
    expect(await loadScam(respond("<!doctype html><html></html>", 200, "text/html"))).toEqual({ state: "none" });
  });

  it("a missing file is none; a server error is unavailable; a network failure is unavailable", async () => {
    expect(await loadScam(respond("", 404))).toEqual({ state: "none" });
    expect(await loadScam(respond("", 500))).toEqual({ state: "unavailable" });
    expect(await loadScam(async () => { throw new TypeError("offline"); })).toEqual({ state: "unavailable" });
  });

  it("a good file is a result and a bad one is invalid with its reason", async () => {
    const good = await loadScam(respond(JSON.stringify(scamFixture())));
    expect(good.state).toBe("result");
    expect(await loadScam(respond(JSON.stringify({ ...scamFixture(), passed: 6 })))).toEqual({ state: "invalid", reason: "The passed count does not match the clips." });
    expect(await loadScam(respond("{not json"))).toEqual({ state: "invalid", reason: "The file is not JSON." });
  });
});
