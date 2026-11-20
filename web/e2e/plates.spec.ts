import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// Read-only on the test drill: the map's plates follow the plate rule, and command's switch shows every percent.
test("the command map shows plates of 1.0% or more, and Every percent shows the rest but never <0.1%", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await expect(page.locator(".plate").first()).toBeAttached({ timeout: 15_000 });
  const pct = (t: string) => (t.startsWith("<") ? 0 : parseFloat(t));
  const fitted = await page.locator(".plate:visible").allTextContents();
  expect(fitted.every((t) => pct(t) >= 1)).toBe(true);
  const every = page.getByRole("checkbox", { name: "Every percent" });
  await every.check();
  await expect.poll(async () => (await page.locator(".plate:visible").allTextContents()).length).toBeGreaterThan(fitted.length);
  await expect(page.locator(".plate:visible", { hasText: "<0.1%" })).toHaveCount(0);
  await every.uncheck();
  await expect(page.locator(".plate:visible")).toHaveCount(fitted.length);
});
