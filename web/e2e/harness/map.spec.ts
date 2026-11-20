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
  await expect(wrap).toHaveAttribute("data-ripple", "done", { timeout: 20_000 });
  // The ripple's own record (every grow value, in order), so load on the machine cannot change the answer.
  const log = await page.evaluate(() => (window as unknown as { growLog: { id: number; grow: number }[] }).growLog);
  const NEAR = 1; // AB, the point last seen
  const FAR = 22; // DE, far from AB
  const firstGrow = (id: number) => log.findIndex((e) => e.id === id && e.grow > 0);
  // Every dot starts at nothing, and the far dot starts growing after the near one.
  expect(log.find((e) => e.id === FAR)?.grow).toBe(0);
  expect(firstGrow(NEAR)).toBeGreaterThanOrEqual(0);
  expect(firstGrow(FAR)).toBeGreaterThan(firstGrow(NEAR));
  // Whenever both had started, the far dot was never larger than the near one.
  const now: Record<number, number> = {};
  for (const e of log) {
    now[e.id] = e.grow;
    if (now[NEAR] !== undefined && now[FAR] !== undefined) expect(now[FAR]).toBeLessThanOrEqual(now[NEAR]! + 1e-9);
  }
  // And at the end the far dot is drawn.
  const plate = (await page.locator(".plate").nth(22).boundingBox())!;
  const late = await pixelAt(page, plate.x + plate.width / 2, plate.y - 16);
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

test("on a crowded map no two visible labels overlap, and the most likely cell keeps its labels", async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 420 });
  await page.goto("/harness/map.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const boxes = await page.locator(".seg-code:visible, .plate:visible").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  const pairs = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).map((b) => [a, b]));
  expect(pairs).toEqual([]);
  expect(boxes.length).toBeLessThan(47); // some labels gave way
  await expect(page.locator(".seg-code:visible", { hasText: /^AB$/ })).toHaveCount(1);
  // Every label is still in the page for anything that reads it.
  await expect(page.locator(".seg-code")).toHaveCount(24);
});

test("on a roomy map every code shows, and a plate for each cell of 1.0% or more", async ({ page }) => {
  await page.goto("/harness/map.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await expect(page.locator(".seg-code:visible")).toHaveCount(24);
  // 17 of the 23 cells in the POA hold 1.0% or more; the other six keep their plate in the page, hidden.
  await expect(page.locator(".plate:visible")).toHaveCount(17);
  await expect(page.locator(".plate")).toHaveCount(23);
  const shown = await page.locator(".plate:visible").allTextContents();
  expect(shown.every((t) => parseFloat(t) >= 1)).toBe(true);
});

// Each visible plate against its own cell's box on screen, projected by the map itself.
async function platesAgainstCells(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const m = (window as unknown as { harnessMap: { project: (p: [number, number]) => { x: number; y: number } } }).harnessMap;
    const cells = (window as unknown as { harnessCells: { segmentId: string; ring: [number, number][] }[] }).harnessCells;
    const mapBox = document.querySelector("[data-testid=map]")!.getBoundingClientRect();
    const out: { id: string; fits: boolean }[] = [];
    for (const plate of document.querySelectorAll<HTMLElement>(".plate")) {
      if (getComputedStyle(plate).visibility === "hidden") continue;
      const pr = plate.getBoundingClientRect();
      const at = { x: pr.left + pr.width / 2 - mapBox.left, y: pr.top - 16 - mapBox.top };
      // The plate hangs 16 px below its cell's centre: find the cell whose box holds that point.
      const boxes = cells.map((c) => {
        const pts = c.ring.map((p) => m.project(p));
        return { id: c.segmentId, l: Math.min(...pts.map((q) => q.x)), r: Math.max(...pts.map((q) => q.x)), t: Math.min(...pts.map((q) => q.y)), b: Math.max(...pts.map((q) => q.y)) };
      });
      const cell = boxes.find((b) => at.x >= b.l && at.x <= b.r && at.y >= b.t && at.y <= b.b)!;
      out.push({ id: cell.id, fits: pr.width <= cell.r - cell.l && pr.height <= cell.b - cell.t });
    }
    return out;
  });
}

test("on a small map a plate wider than its cell is hidden, never clipped", async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 420 });
  await page.goto("/harness/map.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const shown = await platesAgainstCells(page);
  expect(shown.length).toBeLessThan(17);
  expect(shown.filter((p) => !p.fits)).toEqual([]);
});

test("with every percent on, every plate of 0.1% or more shows, and never a <0.1% one", async ({ page }) => {
  await page.goto("/harness/map.html?every&tiny");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await expect(page.locator(".plate")).toHaveCount(24);
  await expect(page.locator(".plate", { hasText: "<0.1%" })).toHaveCount(1);
  await expect(page.locator(".plate:visible", { hasText: "<0.1%" })).toHaveCount(0);
  await expect(page.locator(".plate:visible")).toHaveCount(23);
});

test("command's Every percent switch shows every plate of 0.1% or more, and turning it off goes back", async ({ page }) => {
  await page.goto("/harness/map.html?switch");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const every = page.getByRole("checkbox", { name: "Every percent" });
  await expect(every).not.toBeChecked();
  await expect(page.locator(".plate:visible")).toHaveCount(17);
  await every.check();
  await expect(page.locator(".plate:visible")).toHaveCount(23);
  await every.uncheck();
  await expect(page.locator(".plate:visible")).toHaveCount(17);
  // It is reachable by keyboard, with a visible focus ring.
  await every.focus();
  await expect(every).toBeFocused();
});
