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

test("the walkers flow out as dots on one canvas, then hand over to the grid", async ({ page }) => {
  await page.goto("/harness/map.html?walkers");
  const canvas = page.getByTestId("walker-canvas");
  await expect(canvas).toHaveAttribute("data-mode", "flowing", { timeout: 20_000 });
  await page.waitForTimeout(600);
  const lit = await canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    return n;
  });
  expect(lit, "walker dots drawn mid-flow").toBeGreaterThan(50);
  await expect(canvas).toHaveAttribute("data-mode", "final-grid", { timeout: 5_000 });
});

test("with reduced motion the walkers skip straight to the grid", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/harness/map.html?walkers");
  await expect(page.getByTestId("walker-canvas")).toHaveAttribute("data-mode", "final-grid", { timeout: 20_000 });
});

test("every segment's code is drawn beside its dot, so a judge can name the cell", async ({ page }) => {
  await page.goto("/harness/map.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const codes = page.locator(".seg-code");
  await expect(codes).toHaveCount(24); // every cell, including the one left out of the POA
  await expect(codes.filter({ hasText: /^AB$/ })).toHaveCount(1);
  // The code sits left of the dot and never on the percent plate.
  const plate = (await page.locator(".plate").first().boundingBox())!;
  const dotX = plate.x + plate.width / 2;
  const code = (await codes.first().boundingBox())!;
  expect(code.x + code.width).toBeLessThanOrEqual(dotX - 14); // clear of the largest dot's radius
  await expect(page.locator(".plate .seg-code")).toHaveCount(0);
});

test("on a crowded map only the most likely cells keep their code and percent", async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 420 });
  await page.goto("/harness/map.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await expect(page.locator(".seg-code:visible")).toHaveCount(8);
  await expect(page.locator(".plate:visible")).toHaveCount(8);
  // The most likely cell keeps its label; every label is still in the page for anything that reads it.
  await expect(page.locator(".seg-code:visible", { hasText: /^AB$/ })).toHaveCount(1);
  await expect(page.locator(".seg-code")).toHaveCount(24);
});
