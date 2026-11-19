import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// Writes one command-entered sighting to the drill incident per run (the normal product path).
test("a new report plays the beat once on the live post, and a reload does not replay it", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const wrap = page.getByTestId("map").locator("xpath=..");
  await expect(wrap).not.toHaveAttribute("data-beat", /.+/); // nothing plays on load
  await page.getByRole("button", { name: "Add sighting" }).click();
  await page.getByRole("combobox", { name: /^Place\b/ }).selectOption({ index: 1 });
  await page.getByLabel(/^Note/).fill("Drill check: seen near the first segment. Training drill inject.");
  await page.getByRole("button", { name: "Save sighting" }).click();
  await expect(wrap).toHaveAttribute("data-beat", "playing", { timeout: 10_000 });
  await expect(wrap).toHaveAttribute("data-beat", "done", { timeout: 2_500 });
  await expect(page.getByTestId("change-banner")).toHaveText(/\.$/);
  await page.reload();
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("map").locator("xpath=..")).not.toHaveAttribute("data-beat", /.+/);
});
