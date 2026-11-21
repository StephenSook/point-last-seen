import { deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// On a laptop the joined command post fills the window and only its rails scroll, so moving focus down a rail
// never moves the app or hides its header.
test("on a laptop the joined command post never scrolls the document", async ({ page }) => {
  deployedOnly();
  await page.setViewportSize({ width: 1440, height: 900 });
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const sizes = await page.evaluate(() => ({ doc: document.scrollingElement!.scrollHeight, win: window.innerHeight }));
  expect(sizes.doc).toBeLessThanOrEqual(sizes.win);
  await page.locator(".rail.right").locator("button").last().focus();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.locator(".post-head").evaluate((el) => el.getBoundingClientRect().top)).toBe(0);
});
