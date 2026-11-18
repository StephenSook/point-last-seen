import AxeBuilder from "@axe-core/playwright";
import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// axe with the WCAG 2.0 to 2.2 A and AA rules. Each finding prints its rule and the nodes it flags.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const describe = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes.map((n) => JSON.stringify(n.target)).join(", ")}`);

for (const width of [1440, 390]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test("the join page has no WCAG A or AA violation", async ({ page }) => {
      await page.goto("/");
      await page.getByLabel("Join code").waitFor();
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(describe(r.violations)).toEqual([]);
    });

    test("the judge page has no WCAG A or AA violation", async ({ page }) => {
      await page.goto("/judge");
      await page.getByRole("heading", { name: "Judge's door" }).waitFor();
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(describe(r.violations)).toEqual([]);
    });

    test("the joined command post has no WCAG A or AA violation", async ({ page }) => {
      await withDebugToken(page);
      await joinCommand(page);
      await expect(page.locator(".plate").first()).toBeVisible({ timeout: 20_000 });
      // The map canvas and its markers are drawn by MapLibre; the rail, header and forms are ours.
      const r = await new AxeBuilder({ page }).withTags(TAGS).exclude(".maplibregl-canvas").analyze();
      expect(describe(r.violations)).toEqual([]);
    });
  });
}

test("control: axe reports a planted image with no text alternative", async ({ page }) => {
  await page.goto("/judge");
  await page.getByRole("heading", { name: "Judge's door" }).waitFor();
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.src = "/favicon.svg";
    document.querySelector("main")!.append(img);
  });
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(r.violations.map((v) => v.id)).toContain("image-alt");
});
