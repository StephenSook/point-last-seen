import { expect, test } from "@playwright/test";

test("saving the profile closes the form at once, even while the server has not answered", async ({ page }) => {
  await page.goto("/harness/profile.html");
  await page.getByLabel("Answers to").fill("Bea");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByTestId("closed")).toHaveText("Form closed after 1 save.", { timeout: 500 });
});

test("with the family's list of names, the form shows the list and offers no single nickname to edit", async ({ page }) => {
  await page.goto("/harness/profile.html?names=1");
  await expect(page.getByLabel("Nickname")).toHaveCount(0);
  await expect(page.getByText("Names they answer to: Bea, Mom, Roberta. The family keeps this list in their app.")).toBeVisible();
});

test("without a list, the nickname is still edited here", async ({ page }) => {
  await page.goto("/harness/profile.html");
  await expect(page.getByLabel("Nickname")).toBeVisible();
});
