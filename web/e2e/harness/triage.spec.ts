import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// The measurement page runs end to end in a browser. Playwright's Chrome profile has no built-in
// model, so here it must stop at the gate: no frames sampled, nothing checked, no Google request.
const CLIP = fileURLToPath(new URL("../assets/moving-box.mp4", import.meta.url));
test.beforeAll(() => {
  if (!existsSync(CLIP)) execFileSync("sh", [fileURLToPath(new URL("../assets/make-moving-box.sh", import.meta.url))]);
});

test("without the built-in model the measurement stops at the gate and sends nothing", async ({ page }) => {
  await page.goto("/harness/triage.html?clip=/e2e/assets/moving-box.mp4");
  await page.getByRole("button", { name: "Run triage" }).click();
  await expect(page.getByTestId("report")).not.toHaveText("");
  const r = JSON.parse(await page.getByTestId("report").innerText()) as { availability: string; samples: number; checks: unknown[]; result: { kind: string }; googleRequests: string[] };
  expect(r.availability).not.toBe("available");
  expect(r.result).toEqual({ kind: "no-model" });
  expect([r.samples, r.checks.length, r.googleRequests.length]).toEqual([0, 0, 0]);
});
