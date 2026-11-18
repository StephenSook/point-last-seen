import { expect, test } from "@playwright/test";

const SENTENCE = "The walker model is a prior for planning. It does not predict where a person is.";

test("Walkers asks first, runs, and states the measured time and the planning-only sentence", async ({ page }) => {
  await page.goto("/harness/prior-switch.html");
  const s = page.getByRole("region", { name: "Prior model" });
  await expect(s).toContainText(SENTENCE);
  await expect(s.getByRole("button", { name: "Rings" })).toHaveAttribute("aria-pressed", "true");
  await expect(s.getByRole("switch", { name: "Pull toward confirmed places (ours)" })).toBeVisible();
  await expect(s.getByRole("switch", { name: "Low mobility: shorter distances (ours)" })).toBeVisible();
  await s.getByRole("switch", { name: "Low mobility: shorter distances (ours)" }).click();
  await s.getByRole("button", { name: "Walkers" }).click();
  await expect(s.getByText("Run the walkers and make them the prior? Every team's map and match code change.")).toBeVisible();
  await s.getByRole("button", { name: "Run walkers" }).click();
  await expect(page.getByTestId("asked")).toHaveText('{"model":"walkers","attract":false,"lowMobility":true}');
  await expect(s.getByRole("button", { name: "Walkers" })).toHaveAttribute("aria-pressed", "true");
  await expect(s).toContainText("10,000 walkers in 1.84 s on this laptop.");
  await expect(s.getByRole("status")).toHaveText("Prior rebuilt on this laptop as v6. Sending.");
});

test("without the site's route graph Walkers is unavailable and says why", async ({ page }) => {
  await page.goto("/harness/prior-switch.html?graph=absent");
  const s = page.getByRole("region", { name: "Prior model" });
  await expect(s.getByRole("button", { name: "Walkers" })).toBeDisabled();
  await expect(s).toContainText("Walkers need this site's route graph.");
  await expect(s).toContainText(SENTENCE);
});
