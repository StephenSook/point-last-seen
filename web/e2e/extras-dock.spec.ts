import { expect, joinCommand, test, withDebugToken } from "./fixtures";

test("the post header carries the extras menu (print sheets, radio cards, export)", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  const more = page.locator(".post-head").getByRole("button", { name: "More" });
  await expect(more).toBeVisible({ timeout: 15_000 });
  await more.click();
  await expect(page.getByRole("menu", { name: "More" }).getByRole("menuitem").first()).toBeVisible();
});
