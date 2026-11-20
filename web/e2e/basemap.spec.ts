import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// The basemap file is the site's own extract (web/public/tiles/<gridId>.pmtiles, kept out of git);
// the build that serves this check must include it.
test("the drill map draws its self-hosted basemap, with no tile request to another host", async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL!) && /tile|pmtiles|protomaps|openstreetmap|mapbox|maptiler|carto/i.test(u)) foreign.push(u);
  });
  await withDebugToken(page);
  await joinCommand(page);
  const wrap = page.getByTestId("map").locator("xpath=..");
  await expect(wrap).toHaveAttribute("data-basemap", "drawn", { timeout: 20_000 });
  await expect(page.getByTestId("map-credit")).toHaveText("© OpenStreetMap contributors · Protomaps");
  expect(foreign).toEqual([]);
});
