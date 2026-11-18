import { expect, test } from "@playwright/test";

test("the suggested plan names teams by their names, not their document ids", async ({ page }) => {
  await page.goto("/harness/plan.html");
  await page.getByRole("button", { name: "Suggest plan" }).click();
  const card = page.getByTestId("suggested-plan");
  await expect(card.getByRole("listitem").first()).toContainText("Team 1");
  await expect(card.getByRole("listitem").nth(1)).toContainText("Team 2");
  await expect(card.getByText(/^T1$/)).toHaveCount(0);
});
