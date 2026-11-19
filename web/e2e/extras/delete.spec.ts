import { expect, test } from "@playwright/test";

// The dock harness passes fakes: nothing is deleted.
const harness = "/extras-harness/dock.html";

test("More offers Delete this search's clips and photos, which asks with the counts before anything runs", async ({ page }) => {
  await page.goto(harness);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete this search's clips and photos" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this search's clips and photos" });
  await expect(dialog).toContainText("Delete 2 clips and 1 photo for this search? This can't be undone.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.dataset["deleteRuns"] ?? "0")).toBe("0");
});

test("Delete now runs once and shows what was removed", async ({ page }) => {
  await page.goto(harness);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete this search's clips and photos" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this search's clips and photos" });
  await dialog.getByRole("button", { name: "Delete now" }).click();
  await expect(dialog.getByRole("status")).toHaveText("The server reports 6 items deleted: clips, photos and their readings.");
  expect(await page.evaluate(() => document.body.dataset["deleteRuns"])).toBe("1");
});
