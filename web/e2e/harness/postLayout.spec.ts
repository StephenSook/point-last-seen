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

test("when the link drops, the offline line sits under the header and the map and rails keep the rest of the window", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/harness/post-layout.html");
  const before = (await page.locator(".post-body").boundingBox())!;
  await page.goto("/harness/post-layout.html?offline=1");
  const line = (await page.getByRole("status").filter({ hasText: "No connection" }).boundingBox())!;
  const head = (await page.locator(".post-head").boundingBox())!;
  const body = (await page.locator(".post-body").boundingBox())!;
  // The line sits right under the header, no taller than two lines of text.
  expect(Math.abs(line.y - (head.y + head.height))).toBeLessThanOrEqual(1);
  expect(line.height).toBeLessThanOrEqual(48);
  // The body starts right under the line and still reaches the bottom of the window.
  expect(Math.abs(body.y - (line.y + line.height))).toBeLessThanOrEqual(1);
  expect(Math.abs(body.y + body.height - 800)).toBeLessThanOrEqual(1);
  expect(body.height).toBeGreaterThanOrEqual(before.height - 48);
  // And nothing scrolls the whole document.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
});
