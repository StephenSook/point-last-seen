import { expect, test } from "@playwright/test";

test("Problem reports lists each flag in one line, newest first, with the reporter's note and time", async ({ page }) => {
  await page.goto("/harness/flags.html");
  const panel = page.getByRole("region", { name: "Problem reports" });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("listitem").nth(0)).toContainText("Family member flagged the family's description: wrong or misleading.");
  await expect(panel.getByRole("listitem").nth(0)).toContainText("Her coat is green, not blue.");
  await expect(panel.getByRole("listitem").nth(0)).toContainText("15:40");
  await expect(panel.getByRole("listitem").nth(1)).toContainText("Team 1 searcher flagged a report from 15:00 in segment AE: personal information that should not be shared.");
});

test("with no flags there is no Problem reports panel", async ({ page }) => {
  await page.goto("/harness/flags.html?none=1");
  await expect(page.getByText("Synthetic flags, not drill data.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Problem reports" })).toHaveCount(0);
});

test("a flag names the report it is about", async ({ page }) => {
  await page.goto("/harness/flags.html");
  await expect(page.getByRole("region", { name: "Problem reports" }).getByRole("list").getByRole("listitem").nth(1))
    .toContainText("Team 1 searcher flagged a report from 15:00 in segment AE: personal information that should not be shared.");
});

test("many flags show the newest three, then Show all; a long note does not push the page sideways", async ({ page }) => {
  await page.goto("/harness/flags.html?many=1");
  const panel = page.getByRole("region", { name: "Problem reports" });
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await panel.getByRole("button", { name: "Show all 5 problem reports" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(5);
  const wide = await panel.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(wide).toBeLessThanOrEqual(0);
});

test("a refused read says the reports may be out of date, even with none shown", async ({ page }) => {
  await page.goto("/harness/flags.html?none=1&stale=1");
  await expect(page.getByRole("region", { name: "Problem reports" })).toContainText("These reports may be out of date. Reload the page.");
});
