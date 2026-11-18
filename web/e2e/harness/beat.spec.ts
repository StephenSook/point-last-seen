import { expect, test } from "@playwright/test";

const ALL = "arc arcFade chips lightness:AA lightness:AB lightness:CD pin pulse reorder";

test("the REPORT beat plays every step and finishes in about two seconds", async ({ page }) => {
  await page.goto("/harness/beat.html");
  await expect(page.locator("body")).toHaveAttribute("data-reduced", "false");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-beat", "done", { timeout: 2_500 });
  await expect(page.locator("body")).toHaveAttribute("data-steps", ALL);
  const ms = Number(await page.locator("body").getAttribute("data-ms"));
  expect(ms).toBeGreaterThanOrEqual(1_900);
  expect(ms).toBeLessThanOrEqual(2_400);
});

test("with reduced motion the beat is one short fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/harness/beat.html");
  await expect(page.locator("body")).toHaveAttribute("data-reduced", "true");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-beat", "done", { timeout: 1_000 });
  await expect(page.locator("body")).toHaveAttribute("data-steps", "fade");
  expect(Number(await page.locator("body").getAttribute("data-ms"))).toBeLessThan(400);
});
