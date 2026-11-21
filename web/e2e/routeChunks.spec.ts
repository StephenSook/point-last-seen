import { expect, test } from "@playwright/test";

// Each page loads its own code: the judge page never downloads the command post's own chunk (its rails and forms), and
// the command post loads it when it opens. (Firebase, MapLibre for the replay and reCAPTCHA are shared and still load.)
async function scriptBytes(page: import("@playwright/test").Page, path: string): Promise<{ total: number; names: string[] }> {
  const seen: { url: string; size: number }[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return;
    const body = await r.body().catch(() => Buffer.alloc(0));
    seen.push({ url: r.url(), size: body.length });
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return { total: seen.reduce((s, x) => s + x.size, 0), names: seen.map((x) => new URL(x.url).pathname.split("/").pop() ?? "") };
}

test("the judge page loads none of the command post's code", { tag: "@no-backend" }, async ({ page }) => {
  const { total, names } = await scriptBytes(page, "/judge");
  expect(names.filter((n) => /^CommandPost-/.test(n))).toEqual([]);
  expect(names.some((n) => /^JudgePage-/.test(n))).toBe(true);
  expect(total).toBeGreaterThan(0);
});

test("the command post loads its own code when it is opened", { tag: "@no-backend" }, async ({ page }) => {
  const { names } = await scriptBytes(page, "/");
  expect(names.some((n) => /^CommandPost-/.test(n))).toBe(true);
});
