import { describe, expect, it } from "vitest";
import { RC_DEFAULTS, parseRc } from "./rc";

describe("Remote Config", () => {
  it("has the design's keys and defaults", () => {
    expect(RC_DEFAULTS).toEqual({
      cloud_model_ios: "gemini-3.5-flash-lite",
      cloud_model_web: "gemini-3.5-flash-lite",
      cloud_model_android: "gemini-3.5-flash-lite",
      clip_model: "gemini-3.5-flash-lite",
      token_budget_fraction: 0.5,
      kill_cloud: false,
      use_limited_use_tokens: true,
      replan_use_tools: false,
      judge_seed_run_id: "",
      judge_sessions_per_day: 300,
      minimum_version_ios: "",
      minimum_version_android: "",
    });
  });

  it("reads typed values for the web seat", () => {
    const rc = parseRc({ cloud_model_web: "gemini-3.5-flash-lite", kill_cloud: "true", use_limited_use_tokens: "false", judge_sessions_per_day: "12" });
    expect(rc.cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(rc.killCloud).toBe(true);
    expect(rc.useLimitedUseTokens).toBe(false);
    expect(rc.judgeSessionsPerDay).toBe(12);
  });

  it("falls back to the default for missing keys", () => {
    const rc = parseRc({});
    expect(rc.cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(rc.clipModel).toBe("gemini-3.5-flash-lite");
    expect(rc.killCloud).toBe(false);
    expect(rc.useLimitedUseTokens).toBe(true);
  });

  it("keeps live paths on the flash-lite family", () => {
    expect(parseRc({ cloud_model_web: "gemini-3.6-flash-lite" }).cloudModelWeb).toBe("gemini-3.6-flash-lite");
    expect(parseRc({ cloud_model_web: "gemini-3.5-flash" }).cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(parseRc({ clip_model: "gemini-3.5-pro" }).clipModel).toBe("gemini-3.5-flash-lite");
  });

  it("refuses a model id that is not a Gemini id", () => {
    expect(parseRc({ cloud_model_web: "" }).cloudModelWeb).toBe("gemini-3.5-flash-lite");
    expect(parseRc({ cloud_model_web: "gpt-x" }).cloudModelWeb).toBe("gemini-3.5-flash-lite");
  });

  it("keeps numbers in range", () => {
    expect(parseRc({ token_budget_fraction: "2" }).tokenBudgetFraction).toBe(0.5);
    expect(parseRc({ token_budget_fraction: "abc" }).tokenBudgetFraction).toBe(0.5);
    expect(parseRc({ token_budget_fraction: "0.3" }).tokenBudgetFraction).toBe(0.3);
    expect(parseRc({ judge_sessions_per_day: "-1" }).judgeSessionsPerDay).toBe(300);
  });

  it("reads a boolean only from true or false", () => {
    expect(parseRc({ kill_cloud: "yes" }).killCloud).toBe(false);
    expect(parseRc({ kill_cloud: "TRUE" }).killCloud).toBe(true);
  });
});
