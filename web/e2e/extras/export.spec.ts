import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("the exported text loads into a MapLibre GeoJSON source and every segment is queryable", async ({ page }) => {
  await page.goto("/extras-harness/print.html");
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export GeoJSON" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^pls-oak-park-plan-v5-\d{8}T\d{4}Z\.geojson$/);
  const text = await readFile(await download.path(), "utf8");
  const json = JSON.parse(text);
  expect(json.type).toBe("FeatureCollection");
  expect(json.features).toHaveLength(2);

  const ids = await page.evaluate((downloadedText) => {
    const harness = window as Window & { queryExportedSegments?: (text: string) => Promise<string[]> };
    if (!harness.queryExportedSegments) throw new Error("The export harness did not load.");
    return harness.queryExportedSegments(downloadedText);
  }, text);
  expect(ids).toEqual(["AA", "BB"]);
});
