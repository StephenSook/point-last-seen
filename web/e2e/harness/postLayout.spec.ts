import { expect, test } from "@playwright/test";

// On a laptop the command post fills the window and only its rails scroll. A visually hidden line inside a rail
// once escaped the rail and made the whole document taller than the window, so focus or scrollIntoView moved
// the app and hid its header.
test("on a laptop the document never scrolls; a rail scrolls inside itself", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/harness/post-layout.html");
  await expect(page.getByRole("button", { name: "Last button" })).toBeAttached();
  const sizes = await page.evaluate(() => ({ doc: document.scrollingElement!.scrollHeight, win: window.innerHeight }));
  expect(sizes.doc).toBeLessThanOrEqual(sizes.win);
  await page.getByRole("button", { name: "Last button" }).focus();
  await page.getByRole("button", { name: "Last button" }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.locator(".post-head").evaluate((el) => el.getBoundingClientRect().top)).toBe(0);
  expect(await page.getByRole("complementary", { name: "Rail" }).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test("on a phone the page still scrolls as one column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/harness/post-layout.html");
  await expect(page.getByRole("button", { name: "Last button" })).toBeAttached();
  const sizes = await page.evaluate(() => ({ doc: document.scrollingElement!.scrollHeight, win: window.innerHeight }));
  expect(sizes.doc).toBeGreaterThan(sizes.win);
});
