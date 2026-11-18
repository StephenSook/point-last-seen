import { expect, test } from "@playwright/test";

const top = async (page: import("@playwright/test").Page, id: string) =>
  (await page.locator("[data-testid=poa-rank] tr", { hasText: id }).first().boundingBox())!.y;

test("a reordered row starts at its old place and slides to the new one after the delay", async ({ page }) => {
  await page.goto("/harness/rank.html?delay=300");
  const oldAC = await top(page, "AC");
  const firstRow = await top(page, "AA");
  await page.getByRole("button", { name: "Report" }).click();
  expect(Math.abs((await top(page, "AC")) - oldAC)).toBeLessThan(2);
  await page.waitForTimeout(300 + 350 + 150);
  expect(Math.abs((await top(page, "AC")) - firstRow)).toBeLessThan(2);
});

test("with reduced motion the new order shows at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/harness/rank.html?delay=300");
  const firstRow = await top(page, "AA");
  await page.getByRole("button", { name: "Report" }).click();
  expect(Math.abs((await top(page, "AC")) - firstRow)).toBeLessThan(2);
});
