import { expect, joinCommand, test, withDebugToken } from "./fixtures";

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the map comes first, is taller than 300 px, and the page does not scroll sideways", async ({ page }) => {
    await withDebugToken(page);
    await joinCommand(page);
    const map = await page.getByTestId("map").boundingBox();
    expect(map, "map has a box").not.toBeNull();
    expect(map!.height).toBeGreaterThan(300);
    for (const rail of await page.locator(".rail").all()) {
      const r = await rail.boundingBox();
      expect(r!.y, "each rail sits below the map").toBeGreaterThanOrEqual(map!.y + map!.height - 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
