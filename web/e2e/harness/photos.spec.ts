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
  await row.getByRole("button", { name: "Send this photo to the cloud" }).click();
  await expect(row.getByText("This photo was deleted.")).toBeVisible();
});

test("a family answer for a photo that was deleted is not saved, and says why", async ({ page }) => {
  await page.goto("/harness/photos.html?deleted=1");
  const row = page.locator(".photo").nth(0);
  await row.getByRole("button", { name: "No", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText("This photo was deleted.");
});

test("a family answer is not saved when the photo cannot be checked, and says so", async ({ page }) => {
  await page.goto("/harness/photos.html?unchecked=1");
  const row = page.locator(".photo").nth(0);
  await row.getByRole("button", { name: "No", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText("Could not check this photo. The answer was not saved. Try again.");
  await expect(row.getByRole("button", { name: "No", exact: true })).toBeEnabled();
});

test("a photo the family did not agree to read in the cloud is not read by a cloud model", async ({ page }) => {
  await page.goto("/harness/photos.html?consent=none");
  const row = page.locator(".photo").nth(0);
  await row.getByRole("button", { name: "Read on this laptop" }).click();
  await row.getByRole("button", { name: "Read in the cloud" }).click();
  await expect(row.getByText("Sent only if the family agreed to a cloud reading when they shared it.")).toBeVisible();
  await row.getByRole("button", { name: "Send this photo to the cloud" }).click();
  await expect(row.getByText("The family has not agreed to a cloud reading of this photo, so no AI model in the cloud reads it.")).toBeVisible();
});

test("each photo row carries its own hash, the name its consent record has", async ({ page }) => {
  await page.goto("/harness/photos.html?save=never");
  await expect(page.locator(".photo").nth(0)).toHaveAttribute("data-sha256", "a".repeat(64));
  await expect(page.locator(".photo").nth(1)).toHaveAttribute("data-sha256", "b".repeat(64));
});

test("a cloud photo read carries a closed What ran receipt with the bytes of the photo sent", async ({ page }) => {
  await page.goto("/harness/photos.html?read=cloud");
  const row = page.locator(".photo").first();
  await row.getByRole("button", { name: "Read on this laptop" }).click();
  await row.getByRole("button", { name: "Read in the cloud" }).click();
  await row.getByRole("button", { name: "Send this photo to the cloud" }).click();
  const receipt = row.getByRole("group").filter({ has: page.getByText("What ran", { exact: true }) });
  await receipt.getByText("What ran", { exact: true }).click();
  await expect(receipt).toContainText("Asked for: the cloud, with the family's consent.");
  await expect(receipt).toContainText("Ran: in the cloud (reported by the SDK).");
  await expect(receipt).toContainText("Model: gemini-3.5-flash-lite.");
  await expect(receipt).toContainText(/Sent: [0-9,]+ bytes of the photo, as base64\./);
});
