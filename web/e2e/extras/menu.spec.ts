import { expect, test } from "@playwright/test";

test("the More menu lists six items in order and follows the menu button keys", async ({ page }) => {
  await page.goto("/extras-harness/print.html");
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.focus();
  await page.keyboard.press("Space");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "More" });
  const names = await menu.locator('[role^="menuitem"]').evaluateAll((items) => items.map((i) => i.firstChild?.textContent?.trim() ?? ""));
  expect(names).toEqual(["Replay", "Print assignment sheet", "Print radio cards", "Check a radio code", "Export GeoJSON", "Terrain"]);
  await expect(menu.getByRole("menuitem", { name: "Replay" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Print assignment sheet" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Export GeoJSON" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();
});
