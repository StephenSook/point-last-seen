import { expect, test } from "@playwright/test";

test("the suggested plan names teams by their names, not their document ids", async ({ page }) => {
  await page.goto("/harness/plan.html");
  await page.getByRole("button", { name: "Suggest plan" }).click();
  const card = page.getByTestId("suggested-plan");
  await expect(card.getByRole("listitem").first()).toContainText("Team 1");
  await expect(card.getByRole("listitem").nth(1)).toContainText("Team 2");
  await expect(card.getByText(/^T1$/)).toHaveCount(0);
});

test("a suggestion is withdrawn when the draft's assignments change, so old wording never meets new segments", async ({ page }) => {
  await page.goto("/harness/plan.html");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  await expect(page.getByTestId("suggested-plan")).toBeVisible();
  await page.getByRole("button", { name: "Assignments change" }).click();
  await expect(page.getByTestId("suggested-plan")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
});
