import { describe, expect, it } from "vitest";
import config from "../e2e/playwright.config";

// The App Check debug-token exchange carries the secret in its request body and
// the issued token in its response. A Playwright trace records both bodies, so
// no e2e run may write a trace, a video or a HAR to disk.
describe("Playwright config", () => {
  it("never records traces, videos or network archives", () => {
    const projects = config.projects ?? [];
    for (const use of [config.use ?? {}, ...projects.map((p) => p.use ?? {})]) {
      expect(use.trace ?? "off").toBe("off");
      expect(use.video ?? "off").toBe("off");
      expect((use as { recordHar?: unknown }).recordHar).toBeUndefined();
    }
  });

  it("uses a reporter that writes no attachments", () => {
    const reporters = (Array.isArray(config.reporter) ? config.reporter : [[config.reporter]]).map((r) => (Array.isArray(r) ? r[0] : r));
    expect(reporters).toEqual(["list"]);
  });
});
