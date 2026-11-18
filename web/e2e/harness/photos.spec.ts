import { expect, test } from "@playwright/test";

test("a family answer shows at once and the buttons stay usable while the save is still waiting", async ({ page }) => {
  await page.goto("/harness/photos.html?save=never");
  const rows = page.locator(".photo");
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByRole("button", { name: "Yes", exact: true }).click();
  await expect(rows.nth(0).getByText("Family said: yes")).toBeVisible({ timeout: 500 });
  await expect(rows.nth(1).getByRole("button", { name: "Read on this laptop" })).toBeEnabled();
  await expect(rows.nth(1).getByRole("button", { name: "No", exact: true })).toBeEnabled();
});

test("a refused save says so beside the photo and brings the answer buttons back", async ({ page }) => {
  await page.goto("/harness/photos.html?save=fail");
  const row = page.locator(".photo").nth(0);
  await row.getByRole("button", { name: "No", exact: true }).click();
  await expect(row.getByText("Not saved. Try again.")).toBeVisible();
  await expect(row.getByRole("button", { name: "No", exact: true })).toBeEnabled();
});

test("a cloud read of a photo that was deleted is refused with that reason", async ({ page }) => {
  await page.goto("/harness/photos.html?deleted=1");
  const row = page.locator(".photo").nth(0);
  await row.getByRole("button", { name: "Read on this laptop" }).click();
  await row.getByRole("button", { name: "Read in the cloud" }).click();
  await row.getByRole("button", { name: "I consent for this photo" }).click();
  await expect(row.getByText("This photo was deleted.")).toBeVisible();
});

test("a family answer for a photo that was deleted is not saved, and says why", async ({ page }) => {
  await page.goto("/harness/photos.html?deleted=1");
  const row = page.locator(".photo").nth(0);
  await row.getByRole("button", { name: "No", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText("This photo was deleted.");
});
