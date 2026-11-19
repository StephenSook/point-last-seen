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
