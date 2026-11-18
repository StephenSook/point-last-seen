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

test("on a prior's first draw the dots grow outward from the point last seen", async ({ page }) => {
  await page.goto("/harness/map.html?ripple");
  const wrap = page.getByTestId("map").locator("xpath=..");
  await expect(wrap).toHaveAttribute("data-ripple", "playing", { timeout: 20_000 });
  const plates = page.locator(".plate");
  const far = (await plates.nth(22).boundingBox())!; // DE, far from AB
  const centre = { x: far.x + far.width / 2, y: far.y - 16 };
  const early = await pixelAt(page, centre.x, centre.y);
  expect(near(early, MAP_INK.dot), `far dot already drawn early: ${hex(early)}`).toBe(false);
  await expect(wrap).toHaveAttribute("data-ripple", "done", { timeout: 3_000 });
  const late = await pixelAt(page, centre.x, centre.y);
  expect(near(late, MAP_INK.dot), `far dot after the ripple: ${hex(late)}`).toBe(true);
});

test("with reduced motion the dots are drawn at once, with no ripple", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/harness/map.html?ripple");
  const wrap = page.getByTestId("map").locator("xpath=..");
  await expect(wrap).toHaveAttribute("data-ripple", "done", { timeout: 20_000 });
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const far = (await page.locator(".plate").nth(22).boundingBox())!;
  expect(near(await pixelAt(page, far.x + far.width / 2, far.y - 16), MAP_INK.dot)).toBe(true);
});
