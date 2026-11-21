import { expect, test } from "@playwright/test";

test("Problem reports lists each flag in one line, newest first, with the reporter's note and time", async ({ page }) => {
  await page.goto("/harness/flags.html");
  const panel = page.getByRole("region", { name: "Problem reports" });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("listitem").nth(0)).toContainText("Family member flagged the family's description: wrong or misleading.");
  await expect(panel.getByRole("listitem").nth(0)).toContainText("Her coat is green, not blue.");
  await expect(panel.getByRole("listitem").nth(0)).toContainText("15:40");
  await expect(panel.getByRole("listitem").nth(1)).toContainText("Team 1 searcher flagged a report: personal information that should not be shared.");
});

test("with no flags there is no Problem reports panel", async ({ page }) => {
  await page.goto("/harness/flags.html?none=1");
  await expect(page.getByText("Synthetic flags, not drill data.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Problem reports" })).toHaveCount(0);
});
