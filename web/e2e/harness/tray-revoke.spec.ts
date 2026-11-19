import { expect, test } from "@playwright/test";

test("a delete announced by another seat empties this seat's tray", async ({ page }) => {
  await page.goto("/harness/tray-revoke.html");
  await expect(page.locator(".photo")).toHaveCount(2);
  await page.getByRole("button", { name: "Another seat deletes" }).click();
  await expect(page.locator(".photo")).toHaveCount(0);
  await expect(page.getByText("No photos yet.")).toBeVisible();
});

test("a reload that started before the delete does not bring the photos back", async ({ page }) => {
  await page.goto("/harness/tray-revoke.html");
  await expect(page.locator(".photo")).toHaveCount(2);
  await page.getByRole("button", { name: "Slow reload" }).click();
  await page.getByRole("button", { name: "Another seat deletes" }).click();
  await expect(page.locator(".photo")).toHaveCount(0);
  await page.getByRole("button", { name: "Load finishes" }).click();
  await page.waitForTimeout(300);
  await expect(page.locator(".photo")).toHaveCount(0);
});
