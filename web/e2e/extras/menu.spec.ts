import { expect, test } from "@playwright/test";

test("the More menu lists its items in order and follows the menu button keys", async ({ page }) => {
  await page.goto("/extras-harness/print.html");
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.focus();
  await page.keyboard.press("Space");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "More" });
  const names = await menu.locator('[role^="menuitem"]').evaluateAll((items) => items.map((i) => i.firstChild?.textContent?.trim() ?? ""));
  // This page's site has no elevation file, so "Terrain" is not offered (the terrain page checks it comes last).
  expect(names).toEqual(["Replay", "Print assignment sheet", "Print radio cards", "Print debrief sheets", "Check a radio code", "Export GeoJSON"]);
  await expect(menu.getByRole("menuitem", { name: "Replay" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Print assignment sheet" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Export GeoJSON" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();
});

test("with a site elevation file, Terrain is the last item", async ({ page }) => {
  await page.goto("/extras-harness/terrain.html");
  await expect(page.locator(".plate:not(.crowded)").first()).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  const names = await page.getByRole("menu", { name: "More" }).locator('[role^="menuitem"]').evaluateAll((items) => items.map((i) => i.firstChild?.textContent?.trim() ?? ""));
  expect(names.at(-1)).toBe("Terrain");
});

test("the delete item, when the command post offers it, is last in the menu", async ({ page }) => {
  await page.goto("/extras-harness/dock.html");
  await page.getByRole("button", { name: "More", exact: true }).click();
  const names = await page.getByRole("menu", { name: "More" }).locator('[role^="menuitem"]').evaluateAll((items) => items.map((i) => i.firstChild?.textContent?.trim() ?? ""));
  expect(names.at(-1)).toBe("Delete this search's clips and photos");
  expect(names.slice(0, 5)).toEqual(["Replay", "Print assignment sheet", "Print radio cards", "Print debrief sheets", "Check a radio code"]);
});

