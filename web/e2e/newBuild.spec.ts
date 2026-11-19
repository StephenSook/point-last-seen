import { expect, test, type Page } from "@playwright/test";

// The page is served by the site's own service worker (second load), then a new build's worker takes over.
// The event is fired by the test; the browser fires the same one when a new deploy's worker claims the page.
async function controlled(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

const takeOver = (page: Page) => page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));

test("when a new build's worker takes over, the page reloads into it", { tag: "@no-backend" }, async ({ page }) => {
  await controlled(page, "/judge");
  await page.evaluate(() => { (window as { oldBuild?: boolean }).oldBuild = true; });
  const reloaded = page.waitForEvent("load");
  await takeOver(page);
  await reloaded;
  expect(await page.evaluate(() => (window as { oldBuild?: boolean }).oldBuild)).toBeUndefined();
});

test("while words are typed the page asks before reloading, so nothing typed is lost", { tag: "@no-backend" }, async ({ page }) => {
  await controlled(page, "/");
  await page.getByRole("textbox").first().fill("drill-dev-1");
  await page.evaluate(() => { (window as { oldBuild?: boolean }).oldBuild = true; });
  await takeOver(page);
  const bar = page.getByRole("status").filter({ hasText: "A new version of this page is ready." });
  await expect(bar).toBeVisible();
  expect(await page.evaluate(() => (window as { oldBuild?: boolean }).oldBuild)).toBe(true);
  await expect(page.getByRole("textbox").first()).toHaveValue("drill-dev-1");
  await expect(bar.getByRole("button", { name: "Reload" })).toBeVisible();
});
