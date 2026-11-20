import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { MAP_INK, POA_RAMP } from "../../src/map/poaStyle";
import { hex, near, pixelAt } from "./pixel";

test("a report's change shows a banner, cyan outlines, three chips, and Space shows the map before it", async ({ page }) => {
  await page.goto("/harness/change.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await expect(page.getByTestId("change-banner")).toHaveText(/^Slipper in water \(training inject\)\. CD \d+\.\d% to \d+\.\d%\.$/);
  await expect(page.getByRole("status")).toContainText("Segment CD. POA");
  const chips = page.getByTestId("delta-chip");
  await expect(chips).toHaveCount(3);
  await expect(chips.first()).toHaveText(/^\+\d+\.\d pts?$/);

  // The cyan edge: half a cell to the right of CD's dot (cells are square; plates are one cell apart).
  const plates = page.locator(".plate");
  const cd = (await plates.nth(2 * 6 + 3).boundingBox())!;
  const ce = (await plates.nth(2 * 6 + 4).boundingBox())!;
  const cell = ce.x - cd.x;
  const x0 = cd.x + cd.width / 2 + cell / 2;
  const y = cd.y - 16 - cell / 4;
  const across = await Promise.all([-4, -3, -2, -1, 0, 1, 2, 3, 4].map((dx) => pixelAt(page, x0 + dx, y)));
  expect(across.some((p) => near(p, MAP_INK.moved, 40)), `across the edge: ${across.map(hex).join(" ")}`).toBe(true);
  // An edge away from the three largest moves (between DE and DF, bottom right) has no cyan.
  const de = (await plates.nth(3 * 6 + 4).boundingBox())!;
  const plain = await Promise.all([-4, -3, -2, -1, 0, 1, 2, 3, 4].map((dx) => pixelAt(page, de.x + de.width / 2 + cell / 2 + dx, de.y - 16 - cell / 4)));
  expect(plain.some((p) => near(p, MAP_INK.moved, 40)), `unmoved edge: ${plain.map(hex).join(" ")}`).toBe(false);

  const after = await plates.nth(2 * 6 + 3).innerText();
  await page.locator("body").press("Space", { delay: 0 }).catch(() => {});
  await page.keyboard.down("Space");
  await expect(page.getByText("Before this report")).toBeVisible();
  await expect(chips).toHaveCount(0);
  expect(await plates.nth(2 * 6 + 3).innerText()).not.toBe(after);
  await page.keyboard.up("Space");
  await expect(chips).toHaveCount(3);
  await expect(plates.nth(2 * 6 + 3)).toHaveText(after);
});

// Fill as drawn: a ramp step at 0.9 opacity over the bg-0 map background.
const drawn = (hexStep: string) => {
  const c = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const bg = "#110F0D";
  return "#" + [1, 3, 5].map((i) => Math.round(0.9 * c(hexStep, i) + 0.1 * c(bg, i)).toString(16).padStart(2, "0")).join("").toUpperCase();
};

async function cdFillPoint(page: import("@playwright/test").Page) {
  const plates = page.locator(".plate");
  const cd = (await plates.nth(2 * 6 + 3).boundingBox())!;
  const ce = (await plates.nth(2 * 6 + 4).boundingBox())!;
  const cell = ce.x - cd.x;
  return { x: cd.x + cd.width / 2 - cell * 0.35, y: cd.y - 16 + cell * 0.35 };
}

test("a new report replays the beat: the old lightness first, the new one when the beat is done", async ({ page }) => {
  await page.goto("/harness/change.html");
  const map = page.getByTestId("map").locator("xpath=..");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const at = await cdFillPoint(page);
  expect(near(await pixelAt(page, at.x, at.y), drawn(POA_RAMP[7]), 6)).toBe(true);
  await page.getByRole("button", { name: "Report again" }).click();
  await expect(map).toHaveAttribute("data-beat", "playing");
  // Chips rise at 900 ms: hidden at the start of the beat, fully shown when it is done.
  const chipOpacity = () => page.getByTestId("delta-chip").first().evaluate((e) => getComputedStyle(e).opacity);
  expect(await chipOpacity()).toBe("0");
  const early = await pixelAt(page, at.x, at.y);
  expect(near(early, drawn(POA_RAMP[1]), 10), `early ${hex(early)} want ${drawn(POA_RAMP[1])}`).toBe(true);
  await expect(map).toHaveAttribute("data-beat", "done", { timeout: 2_500 });
  const late = await pixelAt(page, at.x, at.y);
  expect(near(late, drawn(POA_RAMP[7]), 6), `late ${hex(late)}`).toBe(true);
  expect(await chipOpacity()).toBe("1");
});

test("with reduced motion a new report shows the final lightness at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/harness/change.html");
  const map = page.getByTestId("map").locator("xpath=..");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  const at = await cdFillPoint(page);
  await page.getByRole("button", { name: "Report again" }).click();
  const now = await pixelAt(page, at.x, at.y);
  expect(near(now, drawn(POA_RAMP[7]), 6), `reduced ${hex(now)}`).toBe(true);
  await expect(map).toHaveAttribute("data-beat", "done", { timeout: 500 });
});

test("the beat springs a pin in at the report and draws an arc to the largest move, then fades the arc", async ({ page }) => {
  await page.goto("/harness/change.html");
  const map = page.getByTestId("map").locator("xpath=..");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await page.getByRole("button", { name: "Report again" }).click();
  await expect(map).toHaveAttribute("data-beat", "playing");
  await expect(page.getByTestId("report-pin")).toBeVisible();
  const arc = page.getByTestId("beat-arc");
  await expect(arc).toBeAttached();
  await page.waitForTimeout(900); // the arc is drawn by 700 ms
  expect(Number(await arc.evaluate((e) => getComputedStyle(e).opacity))).toBeGreaterThan(0.9);
  await expect(map).toHaveAttribute("data-beat", "done", { timeout: 2_500 });
  expect(Number(await arc.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.05);
  await expect(page.getByTestId("report-pin")).toBeVisible();
});

test("the report pin passes the accessibility check: a labelled image, not a labelled plain element", async ({ page }) => {
  await page.goto("/harness/change.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await page.getByRole("button", { name: "Report again" }).click();
  await expect(page.getByTestId("report-pin")).toBeVisible();
  await expect(page.getByRole("img", { name: "Report position" })).toBeVisible();
  const r = await new AxeBuilder({ page }).include(".report-pin").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
