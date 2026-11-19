import { expect, test, type Page } from "@playwright/test";

const harness = "/extras-harness/terrain.html";

async function ready(page: Page, query = "") {
  await page.goto(`${harness}${query}`);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await expect(page.locator(".plate:not(.crowded)").first()).toBeVisible();
}

async function terrainItem(page: Page) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  return page.getByRole("menuitemcheckbox", { name: /^Terrain/ });
}

test("the layer is off by default", async ({ page }) => {
  await ready(page);
  const item = await terrainItem(page);
  await expect(item).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("complementary", { name: "Terrain legend" })).toHaveCount(0);
  expect(await page.evaluate(() => Boolean((window as unknown as { harnessMap: { getLayer(id: string): unknown } }).harnessMap.getLayer("extras-terrain")))).toBe(false);
});

test("turning the terrain layer on changes no percent plate and no match code", async ({ page }) => {
  await ready(page);
  const plates = () => page.locator(".plate").allTextContents();
  const before = { plates: await plates(), code: await page.getByTestId("live-code").textContent() };
  expect(before.plates.length).toBe(9);
  await (await terrainItem(page)).click();
  await expect(page.getByRole("complementary", { name: "Terrain legend" })).toBeVisible();
  const marked = await page.evaluate(async () => {
    const m = (window as unknown as { harnessMap: { getLayer(id: string): unknown; getSource(id: string): { serialize(): { data: { features: { properties: { segmentId: string; cls: string } }[] } } } } }).harnessMap;
    return { layer: Boolean(m.getLayer("extras-terrain")), features: m.getSource("extras-terrain").serialize().data.features.map((f) => `${f.properties.segmentId}:${f.properties.cls}`).sort() };
  });
  // Start B1 at 100 m: A0 92 and A1 96 are lower; C0 108 and B2 104 are higher; the rest are within 3 m.
  expect(marked).toEqual({ layer: true, features: ["A0:lower", "A1:lower", "B2:higher", "C0:higher"] });
  expect(await plates()).toEqual(before.plates);
  await expect(page.getByTestId("live-code")).toHaveText(before.code!);
  await (await terrainItem(page)).click();
  await expect(page.getByRole("complementary", { name: "Terrain legend" })).toHaveCount(0);
  expect(await page.evaluate(() => Boolean((window as unknown as { harnessMap: { getLayer(id: string): unknown } }).harnessMap.getLayer("extras-terrain")))).toBe(false);
});

test("the legend names the source and says display only", async ({ page }) => {
  await ready(page);
  await (await terrainItem(page)).click();
  const legend = page.getByRole("complementary", { name: "Terrain legend" });
  await expect(legend).toContainText("About level (within 3 m; our band).");
  await expect(legend).toContainText("ISRID dementia profile (temperate): found downhill 42%, uphill 19%, same 39%.");
  await expect(legend).toContainText("Elevation: U.S. Geological Survey. Display only. The prior has no elevation term.");
});

test("without this site's elevation file the item is not in the menu", async ({ page }) => {
  await ready(page, "?elev=none");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Replay" })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: /^Terrain/ })).toHaveCount(0);
});
