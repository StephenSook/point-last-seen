import { expect, test } from "@playwright/test";

test("a family report with no place offers Place on map, and Confirm waits for a place", async ({ page }) => {
  await page.goto("/harness/sightings.html");
  const row = page.getByTestId(`sighting-${"f".repeat(32)}`);
  await expect(row).toContainText("No place yet.");
  await expect(row.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await row.getByRole("button", { name: "Place on map" }).click();
  await expect(page.getByTestId("placing")).toHaveText("f".repeat(32));
});

test("a report that already has a place offers no Place on map", async ({ page }) => {
  await page.goto("/harness/sightings.html");
  const row = page.getByTestId(`sighting-${"c".repeat(32)}`);
  await expect(row.getByRole("button", { name: "Place on map" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Confirm" })).toBeEnabled();
});
