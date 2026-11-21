import { expect, joinCommand, mapDrawn, test, withDebugToken } from "./fixtures";

// The drill post on a 390 px phone, as a judge opens it.
test.use({ viewport: { width: 390, height: 844 } });

test("on a phone the post header fits in two lines", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await mapDrawn(page);
  const head = (await page.locator(".post-head").boundingBox())!;
  // Two rows of 44 px controls plus padding; four wrapped lines were about 120 px.
  expect(head.height).toBeLessThanOrEqual(110);
  await expect(page.locator(".post-head .drill")).toHaveText(/Nobody is missing\.$/);
});

test("on a phone the map credit covers no cell label", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await mapDrawn(page);
  await page.waitForTimeout(500);
  const credit = (await page.getByTestId("map-credit").boundingBox())!;
  const boxes = await page.locator(".plate:visible, .seg-code:visible").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  const hit = boxes.filter((b) => b.left < credit.x + credit.width && b.right > credit.x && b.top < credit.y + credit.height && b.bottom > credit.y);
  expect(hit).toEqual([]);
});

test("on a phone a bar at the bottom keeps Add sighting and Plan in reach", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await mapDrawn(page);
  const bar = page.getByRole("navigation", { name: "Quick actions" });
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(844);
  // Plan: the plan comes into view.
  await bar.getByRole("button", { name: "Plan" }).click();
  await expect(page.locator("#plan-h")).toBeInViewport();
  // Add sighting: the form opens and comes into view, without hunting for the button down the page.
  await bar.getByRole("button", { name: "Add sighting" }).click();
  await expect(page.getByRole("form", { name: "Add sighting" }).getByLabel("Seen at")).toBeInViewport();
  await page.getByRole("form", { name: "Add sighting" }).getByRole("button", { name: "Cancel" }).click();
});
