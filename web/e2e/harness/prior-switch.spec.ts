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
  await expect(s).toContainText("10,000 walkers in 1.84 s on this device.");
  await expect(s.getByRole("status")).toHaveText("Prior rebuilt on this device as v6. Sending.");
});

test("without the site's route graph Walkers is unavailable and says why", async ({ page }) => {
  await page.goto("/harness/prior-switch.html?graph=absent");
  const s = page.getByRole("region", { name: "Prior model" });
  await expect(s.getByRole("button", { name: "Walkers" })).toBeDisabled();
  await expect(s).toContainText("Walkers need this site's route graph.");
  await expect(s).toContainText(SENTENCE);
});

test("the chosen model looks chosen: the pressed button is filled", async ({ page }) => {
  await page.goto("/harness/prior-switch.html");
  const s = page.getByRole("region", { name: "Prior model" });
  const bg = (name: string) => s.getByRole("button", { name }).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg("Rings")).toBe("rgb(248, 244, 241)"); // fg-1
  expect(await bg("Walkers")).not.toBe("rgb(248, 244, 241)");
});

test("a ghost button's border is fg-4, so the control's edge is visible on dark ground", async ({ page }) => {
  await page.goto("/harness/prior-switch.html");
  const border = await page.getByRole("region", { name: "Prior model" }).getByRole("button", { name: "Walkers" }).evaluate((e) => getComputedStyle(e).borderTopColor);
  expect(border).toBe("rgb(137, 133, 131)"); // fg-4 #898583
});

test("an older write refused while the next run is going leaves no alert beside the newer success", async ({ page }) => {
  await page.goto("/harness/prior-switch.html?race=1");
  await page.getByRole("button", { name: "Walkers" }).click();
  await page.getByRole("button", { name: "Run walkers" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt on this device as v6. Sending.");
  await page.getByRole("button", { name: "Rings" }).click();
  await page.getByRole("button", { name: "Use rings" }).click();
  await page.getByRole("button", { name: "Refuse the first write" }).click();
  await page.getByRole("button", { name: "Second run finishes" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt as v7.");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an earlier write refused while the next run fails does not stay on Sending", async ({ page }) => {
  await page.goto("/harness/prior-switch.html?race=fail");
  await page.getByRole("button", { name: "Walkers" }).click();
  await page.getByRole("button", { name: "Run walkers" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt on this device as v6. Sending.");
  await page.getByRole("button", { name: "Rings" }).click();
  await page.getByRole("button", { name: "Use rings" }).click();
  await page.getByRole("button", { name: "Refuse the first write" }).click();
  await page.getByRole("button", { name: "Second run finishes" }).click();
  await expect(page.getByRole("alert")).toHaveText("The walker run failed.");
  await expect(page.getByText(/Sending/)).toHaveCount(0);
});
