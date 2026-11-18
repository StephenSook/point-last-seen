import { expect, test } from "@playwright/test";

test("saving the profile closes the form at once, even while the server has not answered", async ({ page }) => {
  await page.goto("/harness/profile.html");
  await page.getByLabel("Answers to").fill("Bea");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByTestId("closed")).toHaveText("Form closed after 1 save.", { timeout: 500 });
});
