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
  await page.getByRole("textbox").first().fill("drill-test-1");
  await page.evaluate(() => { (window as { oldBuild?: boolean }).oldBuild = true; });
  await takeOver(page);
  const bar = page.getByRole("status").filter({ hasText: "A new version of this page is ready." });
  await expect(bar).toBeVisible();
  expect(await page.evaluate(() => (window as { oldBuild?: boolean }).oldBuild)).toBe(true);
  await expect(page.getByRole("textbox").first()).toHaveValue("drill-test-1");
  await expect(bar.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("the page answers the new worker's ping, so the worker leaves it to reload or ask on its own", { tag: "@no-backend" }, async ({ page }) => {
  await controlled(page, "/judge");
  const answered = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const ch = new MessageChannel();
        const t = setTimeout(() => resolve(false), 1000);
        ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data === "pls-build-pong"); };
        navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "pls-build-ping" }, ports: [ch.port2] }));
      }),
  );
  expect(answered).toBe(true);
});

test("the built worker loads the takeover script that moves pages of older builds onto the new one", { tag: "@no-backend" }, async ({ request }) => {
  expect(await (await request.get("/sw.js")).text()).toContain("sw-takeover.js");
  const script = await request.get("/sw-takeover.js");
  expect(script.status()).toBe(200);
  expect(await script.text()).toContain("pls-build-ping");
});
