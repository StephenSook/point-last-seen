import { expect, test } from "./fixtures";

test("robots.txt is a real text file, not the app's HTML", { tag: "@no-backend" }, async ({ request }) => {
  const r = await request.get("/robots.txt");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/text\/plain/);
  expect(await r.text()).toMatch(/^User-agent: \*/m);
});

test("each page has a description and its own title", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /dementia/);
  await expect(page).toHaveTitle("Point Last Seen command post");
  await page.goto("/judge");
  await expect(page).toHaveTitle("Judge's door: Point Last Seen");
});

test("the join page does not shift as it loads", { tag: "@no-backend" }, async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/");
  await page.getByLabel("Join code").waitFor();
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.02);
});
