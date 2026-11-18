import { describe, expect, it } from "vitest";
import { RC_DEFAULTS, parseRc } from "./rc";

describe("Remote Config", () => {
  it("has the design's keys and defaults", () => {
    expect(RC_DEFAULTS).toEqual({
      cloud_model_ios: "gemini-3.5-flash-lite",
      cloud_model_web: "gemini-3.5-flash-lite",
      cloud_model_android: "gemini-3.5-flash-lite",
      kill_cloud: false,
      use_limited_use_tokens: true,
      minimum_version_ios: "",
      minimum_version_android: "",
    });
  });

  it("reads typed values for the web seat", () => {
    const rc = parseRc({ cloud_model_web: "gemini-3.5-flash-lite", kill_cloud: "true", use_limited_use_tokens: "false" });
    expect(rc.cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(rc.killCloud).toBe(true);
    expect(rc.useLimitedUseTokens).toBe(false);
  });

  it("falls back to the default for missing keys", () => {
    const rc = parseRc({});
    expect(rc.cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(rc.killCloud).toBe(false);
    expect(rc.useLimitedUseTokens).toBe(true);
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
