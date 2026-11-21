import { expect, test } from "@playwright/test";

// A disabled outline button on a raised panel (bg-2) keeps its text at 4.5:1 and shows it is off with a dashed edge:
// the theme never puts fg-4 on bg-2 (4.33:1). Measured from computed styles, so a token change cannot pass unseen.
test("a disabled outline button on the sighting form reads at 4.5:1 and has a dashed edge", async ({ page }) => {
  await page.goto("/harness/sighting.html");
  const off = page.locator(".sighting-form .btn.ghost:disabled").first();
  await expect(off).toBeVisible();
  const { ratio, style } = await off.evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    let bg = "rgb(0, 0, 0)";
    for (let e: Element | null = el.parentElement; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && !c.startsWith("rgba(0, 0, 0, 0)") && c !== "transparent") { bg = c; break; }
    }
    const a = lum(rgb(getComputedStyle(el).color));
    const b = lum(rgb(bg));
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), style: getComputedStyle(el).borderTopStyle };
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  expect(style).toBe("dashed");
});
