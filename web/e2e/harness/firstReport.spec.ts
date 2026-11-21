import { expect, test } from "@playwright/test";

// The practice search's first report card: what it says, the one button, and what it says while it saves and confirms.
test("the card says the report, saves and confirms it with one press, and says which step it is on", async ({ page }) => {
  await page.goto("/harness/first-report.html");
  const card = page.getByRole("region", { name: "Try a report" });
  await expect(card).toContainText("A park worker saw a man in a blue coat at the south end of the park, in segment CD, 10 minutes ago.");
  await expect(card).toContainText("It is saved and confirmed like any report, and the map moves to it.");
  const add = card.getByRole("button", { name: "Add and confirm this report" });
  await add.click();
  await expect(card.getByRole("status")).toHaveText("Saving the report...");
  await expect(add).toBeDisabled();
  await expect(card.getByRole("status")).toHaveText("Confirming it as the new last known point...");
  await expect(page.getByTestId("confirmed")).toBeVisible();
  await expect(card).toHaveCount(0);
});

test("a refused save says so and lets command try again", async ({ page }) => {
  await page.goto("/harness/first-report.html?fail=1");
  const card = page.getByRole("region", { name: "Try a report" });
  await card.getByRole("button", { name: "Add and confirm this report" }).click();
  await expect(card.getByRole("alert")).toHaveText("The report was not saved. Check the connection and try again.");
  await expect(card.getByRole("button", { name: "Add and confirm this report" })).toBeEnabled();
});
