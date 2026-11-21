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

test("a long list shows three sightings, the ones awaiting a decision first, then Show all", async ({ page }) => {
  await page.goto("/harness/sightings.html?many=1");
  const panel = page.getByRole("region", { name: "Sightings" });
  await expect(panel).toContainText("6 waiting for a decision.");
  const rows = panel.locator("li.sighting");
  await expect(rows).toHaveCount(3);
  for (const i of [0, 1, 2]) await expect(rows.nth(i).getByRole("button", { name: "Reject" })).toBeVisible();
  await panel.getByRole("button", { name: "Show all 8 sightings" }).click();
  await expect(rows).toHaveCount(8);
  // Decided ones come last.
  await expect(rows.nth(6)).toContainText(/Confirmed|Rejected/);
  await expect(rows.nth(7)).toContainText(/Confirmed|Rejected/);
});

test("three or fewer sightings show without a Show all button", async ({ page }) => {
  await page.goto("/harness/sightings.html");
  const panel = page.getByRole("region", { name: "Sightings" });
  await expect(panel.locator("li.sighting")).toHaveCount(3);
  await expect(panel.getByRole("button", { name: /^Show all/ })).toHaveCount(0);
});
test("a confirm that turned the elevation layer off says why on its card", async ({ page }) => {
  await page.goto("/harness/sightings.html?note=1");
  const row = page.getByTestId("sighting-cccccccccccccccccccccccccccccccc");
  await row.getByRole("button", { name: "Confirm" }).click();
  await expect(row).toContainText("Rebuilt without downhill and level ground: the new start is outside the mapped segments.");
});

