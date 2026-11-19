import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// The drill post on a 390 px phone, as a judge opens it.
test.use({ viewport: { width: 390, height: 844 } });

test("on a phone the post header fits in two lines", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate").first()).toBeVisible({ timeout: 20_000 });
  const head = (await page.locator(".post-head").boundingBox())!;
  // Two rows of 44 px controls plus padding; four wrapped lines were about 120 px.
  expect(head.height).toBeLessThanOrEqual(110);
  await expect(page.locator(".post-head .drill")).toHaveText(/Nobody is missing\.$/);
});

test("on a phone the map credit covers no cell label", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const credit = (await page.getByTestId("map-credit").boundingBox())!;
  const boxes = await page.locator(".plate:visible, .seg-code:visible").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  const hit = boxes.filter((b) => b.left < credit.x + credit.width && b.right > credit.x && b.top < credit.y + credit.height && b.bottom > credit.y);
  expect(hit).toEqual([]);
});
