import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// The command post must come back after a reload with no network: the shell is
// cached by the service worker and the drill data by Firestore's local cache.
test("after one visit the command post reloads with the network off and draws the map", async ({ page, context }) => {
  await withDebugToken(page);
  await joinCommand(page);
  // One full visit: the segments have arrived (so Firestore has cached them) and the service worker controls the page.
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 });

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText("Training drill. Nobody is missing.")).toBeVisible();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Add sighting" })).toBeVisible();
    // The last data comes from Firestore's local cache: the drill's segments still draw.
    await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.setOffline(false);
  }
});
