import { expect, test } from "@playwright/test";

test("the walker Worker returns the engine's own table for the same seed, with a measured time", async ({ page }) => {
  await page.goto("/harness/walkers.html");
  await expect(page.locator("body")).toHaveAttribute("data-equal", "true", { timeout: 30_000 });
  expect(Number(await page.locator("body").getAttribute("data-elapsed"))).toBeGreaterThan(0);
  await expect(page.locator("body")).toHaveAttribute("data-progress", "0,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000");
  await expect(page.locator("body")).toHaveAttribute("data-tracks", "300");
});
