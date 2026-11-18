import type { Page } from "@playwright/test";
import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// WCAG 1.4.11: a text field's edge needs 3:1 against the surface it sits on.
// Measured from computed styles in the page, so a token change cannot pass unseen.
async function fieldEdgeRatios(page: Page, selector: string): Promise<{ name: string; ratio: number }[]> {
  return page.evaluate((sel) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const surface = (el: Element | null): string => {
      for (let e = el; e; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor;
        if (bg && !bg.startsWith("rgba(0, 0, 0, 0)") && bg !== "transparent") return bg;
      }
      return "rgb(0, 0, 0)";
    };
    return [...document.querySelectorAll(sel)].map((el) => {
      const a = lum(rgb(getComputedStyle(el).borderTopColor));
      const b = lum(rgb(surface(el.parentElement)));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { name: (el as HTMLInputElement).name || el.getAttribute("aria-label") || el.tagName, ratio: Math.round(ratio * 100) / 100 };
    });
  }, selector);
}

test("join form fields have an edge of at least 3:1", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Join code").waitFor();
  const ratios = await fieldEdgeRatios(page, ".panel input");
  expect(ratios.length).toBeGreaterThanOrEqual(2);
  for (const r of ratios) expect(r.ratio, r.name).toBeGreaterThanOrEqual(3);
});

test("sighting form fields have an edge of at least 3:1", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await page.getByRole("button", { name: "Add sighting" }).click();
  const ratios = await fieldEdgeRatios(page, ".sighting-form input:not([type=checkbox]):not([type=radio]), .sighting-form select, .sighting-form textarea");
  expect(ratios.length).toBeGreaterThanOrEqual(3);
  for (const r of ratios) expect(r.ratio, r.name).toBeGreaterThanOrEqual(3);
});
