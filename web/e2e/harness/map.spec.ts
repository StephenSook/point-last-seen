import { expect, test } from "@playwright/test";
import { MAP_INK } from "../../src/map/poaStyle";
import { hex, near, pixelAt } from "./pixel";

test("each centre shows the second-signal dot, and its printed percent hangs below it", async ({ page }) => {
  await page.goto("/harness/map.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const plates = page.locator(".plate");
  await expect(plates).toHaveCount(23); // 24 cells, one (DF) left out of the POA
  for (const i of [0, 7, 22]) {
    const box = (await plates.nth(i).boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y - 16 };
    const px = await pixelAt(page, centre.x, centre.y);
    expect(near(px, MAP_INK.dot), `plate ${i}: ${hex(px)} at the centre`).toBe(true);
  }
});

test("MapView hands its map to onReady once loaded", async ({ page }) => {
  await page.goto("/harness/map.html");
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "map", { timeout: 20_000 });
});
