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

test("a long list shows the top 5 segments, with Show all for the rest", async ({ page }) => {
  await page.goto("/harness/rank.html?rows=67");
  const rank = page.getByTestId("poa-rank");
  await expect(rank.locator("tr[data-seg]")).toHaveCount(5);
  await expect(rank.locator("tr[data-seg]").first()).toContainText("S01");
  await expect(rank.getByText("Outside the mapped area")).toBeVisible();
  await page.getByRole("button", { name: "Show all 67" }).click();
  await expect(rank.locator("tr[data-seg]")).toHaveCount(67);
  await page.getByRole("button", { name: "Show top 5" }).click();
  await expect(rank.locator("tr[data-seg]")).toHaveCount(5);
});

test("a short list has no Show all", async ({ page }) => {
  await page.goto("/harness/rank.html");
  await expect(page.getByTestId("poa-rank").locator("tr[data-seg]")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Show/ })).toHaveCount(0);
});

test("the POA heading spells out what POA means", async ({ page }) => {
  await page.goto("/harness/rank.html");
  const abbr = page.getByRole("heading", { name: "POA" }).locator("abbr");
  await expect(abbr).toHaveText("POA");
  await expect(abbr).toHaveAttribute("title", "Probability of area: the engine's estimate for each segment");
});
