import { expect, test } from "@playwright/test";
import { MAP_INK } from "../../src/map/poaStyle";
import { hex, near, pixelAt } from "./pixel";

test("a report's change shows a banner, cyan outlines, three chips, and Space shows the map before it", async ({ page }) => {
  await page.goto("/harness/change.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
  await expect(page.getByTestId("change-banner")).toHaveText(/^Slipper in water \(training inject\)\. CD \d+% to \d+%\.$/);
  await expect(page.getByRole("status")).toContainText("Segment CD. POA");
  const chips = page.getByTestId("delta-chip");
  await expect(chips).toHaveCount(3);
  await expect(chips.first()).toHaveText(/^\+\d+ pts?$/);

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
