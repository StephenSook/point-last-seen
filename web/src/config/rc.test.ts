import { describe, expect, it } from "vitest";
import { RC_DEFAULTS, parseRc } from "./rc";

describe("Remote Config", () => {
  it("sets in-app defaults only for the keys the web reads", () => {
    expect(RC_DEFAULTS).toEqual({ cloud_model_web: "gemini-3.5-flash-lite", kill_cloud: false, use_limited_use_tokens: true, sighting_template_id: "pls-sighting-note-v1", photo_template_id: "pls-photo-cues-v1" });
  });

  it("every value the web parses has a reader in web code (wired, not just parsed)", () => {
    const files = Object.entries(import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>)
      .filter(([path]) => !path.includes("/config/rc") && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));
    expect(files.length).toBeGreaterThan(10);
    for (const field of Object.keys(parseRc({}))) {
      const readers = files.filter(([, src]) => src.includes(`rc.${field}`)).map(([p]) => p);
      expect(readers, `rc.${field}`).not.toEqual([]);
    }
  });

  it("reads the sighting note's server template id, and falls back on an id that is not a plain name", () => {
    expect(parseRc({}).sightingTemplateId).toBe("pls-sighting-note-v1");
    expect(parseRc({ sighting_template_id: "pls-sighting-note-v2" }).sightingTemplateId).toBe("pls-sighting-note-v2");
    for (const bad of ["", "../templates/x", "pls note", "a".repeat(65)]) expect(parseRc({ sighting_template_id: bad }).sightingTemplateId).toBe("pls-sighting-note-v1");
  });

  it("reads the photo read's server template id, and falls back on an id that is not a plain name", () => {
    expect(parseRc({}).photoTemplateId).toBe("pls-photo-cues-v1");
    expect(parseRc({ photo_template_id: "pls-photo-cues-v2" }).photoTemplateId).toBe("pls-photo-cues-v2");
    expect(parseRc({ photo_template_id: "../x" }).photoTemplateId).toBe("pls-photo-cues-v1");
  });

  it("reads typed values for the web seat", () => {
    const rc = parseRc({ cloud_model_web: "gemini-3.5-flash-lite", kill_cloud: "true", use_limited_use_tokens: "false" });
    expect(rc.cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(rc.killCloud).toBe(true);
  });

  it("falls back to the default for missing keys", () => {
    const rc = parseRc({});
    expect(rc.cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(rc.killCloud).toBe(false);
  });

  it("keeps live paths on the flash-lite family", () => {
    expect(parseRc({ cloud_model_web: "gemini-3.6-flash-lite" }).cloudModelWeb).toBe("gemini-3.6-flash-lite");
    expect(parseRc({ cloud_model_web: "gemini-3.5-flash" }).cloudModelWeb).toBe("gemini-3.5-flash-lite");
  });

  it("refuses a model id that is not a Gemini id", () => {
    expect(parseRc({ cloud_model_web: "" }).cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(parseRc({ cloud_model_web: "gpt-x" }).cloudModelWeb).toBe("gemini-3.5-flash-lite");
  });

  it("does not parse clip_model: the clip read (Task 18) is not built, so nothing would read it", () => {
    expect("clipModel" in parseRc({})).toBe(false);
  });

  it("does not parse token_budget_fraction: only the iOS router uses it", () => {
    expect("tokenBudgetFraction" in parseRc({})).toBe(false);
  });

  it("does not parse replan_use_tools: plan wording on the web calls no tools", () => {
    expect("replanUseTools" in parseRc({})).toBe(false);
  });

  it("does not parse the judge-door keys: the startJudgeSession function reads them", () => {
    const rc = parseRc({});
    expect("judgeSeedRunId" in rc).toBe(false);
    expect("judgeSessionsPerDay" in rc).toBe(false);
  });

  it("reads a boolean only from true or false", () => {
    expect(parseRc({ kill_cloud: "yes" }).killCloud).toBe(false);
    expect(parseRc({ kill_cloud: "TRUE" }).killCloud).toBe(true);
  });
});

describe("the web's built-in Remote Config defaults", () => {
  // A browser whose fetch is refused (Remote Config allows 60 fetches a minute per caller IP) or offline runs on these,
  // so each must be the published template's own default: a throttled judge sees the same app as everyone else.
  it("equal the published template's default for every key the web reads", async () => {
    const { readFileSync } = await import("node:fs");
    const template = JSON.parse(readFileSync(new URL("../../../remoteconfig.template.json", import.meta.url), "utf8")) as { parameters: Record<string, { defaultValue: { value: string } }> };
    for (const [key, value] of Object.entries(RC_DEFAULTS)) {
      expect(template.parameters[key]?.defaultValue.value, key).toBe(String(value));
    }
  });
});
