import { expect, test, withDebugToken } from "./fixtures";

// Ends a fresh practice copy (a throwaway judge incident), never the test drill: closing is final. It costs one
// practice search per run.
test.use({ storageState: { cookies: [], origins: [] } });

test("command ends a practice search with a reason; the post says so, stops taking reports, and keeps it after a reload", async ({ page }) => {
  test.setTimeout(180_000);
  await withDebugToken(page);
  await page.goto("/judge");
  await page.getByRole("button", { name: "Try a practice search" }).click();
  await expect(page).toHaveURL(/\?incident=judge-/, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Add sighting" }).first()).toBeEnabled({ timeout: 30_000 });
  const details = page.getByTestId("rail-details");
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  await page.getByRole("button", { name: "End this search" }).click();
  await page.getByRole("radio", { name: "Training ended" }).check();
  await page.getByRole("button", { name: "End search", exact: true }).click();
  const line = "Search ended: training ended. No new reports are taken.";
  await expect(page.getByTestId("ended-line")).toHaveText(line, { timeout: 30_000 });
  for (const b of await page.getByRole("button", { name: "Add sighting" }).all()) await expect(b).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add camera clip" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "End this search" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("ended-line")).toHaveText(line, { timeout: 30_000 });
});
