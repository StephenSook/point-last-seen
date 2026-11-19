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

test("a camera clip from the family shows what it saw and asks for the camera's place before it can be confirmed", async ({ page }) => {
  await page.goto("/harness/sightings.html");
  const row = page.getByTestId(`sighting-${"a".repeat(32)}`);
  await expect(row).toContainText("Camera clip from the family");
  await expect(row).toContainText("green top");
  await expect(row).toContainText("Confirming rebuilds the map from the camera's place.");
  await expect(row.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await row.getByRole("button", { name: "Place camera" }).click();
  await expect(page.getByTestId("placing")).toHaveText("a".repeat(32));
});
