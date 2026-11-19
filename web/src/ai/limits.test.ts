import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clipCloudParams } from "./clipRead";
import { CLOUD_MAX_OUTPUT_TOKENS } from "./limits";
import { wordingParams } from "./replanWording";

// The server's before-generate guard can rewrite a request to its cap only below its media limit; above it,
// a request passes as sent. Every direct cloud call therefore sends the cap itself.
describe("cloud output limit", () => {
  it("equals the guard's text cap", () => {
    const guard = readFileSync(new URL("../../../functions/src/cloudGuard.ts", import.meta.url), "utf8");
    const m = /export const MAX_OUTPUT_TOKENS = (\d+);/.exec(guard);
    expect(m).not.toBeNull();
    expect(CLOUD_MAX_OUTPUT_TOKENS).toBe(Number(m![1]));
  });

  it("is sent by the clip read and the plan wording, the web app's two direct cloud calls", () => {
    expect(clipCloudParams("gemini-3.5-flash-lite").inCloudParams?.generationConfig?.maxOutputTokens).toBe(CLOUD_MAX_OUTPUT_TOKENS);
    expect(wordingParams("gemini-3.5-flash-lite").inCloudParams?.generationConfig?.maxOutputTokens).toBe(CLOUD_MAX_OUTPUT_TOKENS);
  });
});
