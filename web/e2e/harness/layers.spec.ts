import { expect, test } from "@playwright/test";

test("each prior layer shows its source and n, and the wedge says what it needs", async ({ page }) => {
  await page.goto("/harness/layers.html");
  const s = page.getByRole("region", { name: "Prior" });
  await expect(s).toContainText("Temperate flat rings, ISRID dementia (n = 175), measured in a straight line.");
  await expect(s).toContainText("71 m");
  await expect(s).toContainText("our rule, not ISRID's");
  await expect(s.getByRole("switch", { name: "Direction of travel" })).toBeDisabled();
  await expect(s).toContainText("Needs a confirmed direction of travel.");
  await expect(s).toContainText("Vehicle involved: these distances assume travel on foot.");
  await expect(s.getByRole("combobox", { name: "Distance table" })).toHaveValue("temperate_flat");
  await expect(s.getByRole("option", { name: "Temperate flat" })).toBeAttached();
});

test("an urban incident shows Urban first and chosen, and names the urban column and its n", async ({ page }) => {
  await page.goto("/harness/layers.html?terrain=urban");
  const s = page.getByRole("region", { name: "Prior" });
  const table = s.getByRole("combobox", { name: "Distance table" });
  await expect(table).toHaveValue("urban");
  await expect(table.locator("option")).toHaveText(["Urban (suburb, town, big park)", "Temperate flat", "Temperate mountain"]);
  await expect(s).toContainText("Urban rings, ISRID dementia (n = 336), measured in a straight line.");
});

test("a switch asks before it rebuilds the prior, and Cancel puts it back", async ({ page }) => {
  await page.goto("/harness/layers.html");
  const s = page.getByRole("region", { name: "Prior" });
  const linear = s.getByRole("switch", { name: "Near roads, trails and water" });
  await expect(linear).toBeChecked();
  await linear.click();
  await expect(s.getByText("Rebuild the prior? Every team's map and match code change.")).toBeVisible();
  await s.getByRole("button", { name: "Cancel" }).click();
  await expect(linear).toBeChecked();
  await expect(page.getByTestId("applied")).toHaveText("");
});

test("Rebuild prior hands over the new layers and terrain, and says the new version is sending", async ({ page }) => {
  await page.goto("/harness/layers.html");
  const s = page.getByRole("region", { name: "Prior" });
  await s.getByRole("switch", { name: "Near roads, trails and water" }).click();
  await s.getByRole("combobox", { name: "Distance table" }).selectOption("temperate_mountain");
  await s.getByRole("button", { name: "Rebuild prior" }).click();
  await expect(page.getByTestId("applied")).toHaveText('{"linear":false,"wedge":false} temperate_mountain');
  await expect(s.getByRole("status")).toHaveText("Prior rebuilt on this laptop as v5. Sending.");
});

test("with Walkers on, the rebuild question says the prior goes back to rings", async ({ page }) => {
  await page.goto("/harness/layers.html?model=walkers");
  await page.getByRole("switch", { name: "Near roads, trails and water" }).uncheck();
  await expect(page.getByText("Rebuild the prior as rings? Every team's map and match code change.")).toBeVisible();
});

test("Sending stays until the server acknowledges the write, not when the local prior moves", async ({ page }) => {
  await page.goto("/harness/layers.html");
  await page.getByRole("switch", { name: "Near roads, trails and water" }).uncheck();
  await page.getByRole("button", { name: "Rebuild prior" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt on this laptop as v5. Sending.");
  await page.waitForTimeout(300);
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt on this laptop as v5. Sending.");
  await page.getByRole("button", { name: "Server acknowledges" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt as v5.");
});

test("a refusal of an older rebuild does not touch the newer rebuild's status", async ({ page }) => {
  await page.goto("/harness/layers.html");
  const roads = page.getByRole("switch", { name: "Near roads, trails and water" });
  await roads.uncheck();
  await page.getByRole("button", { name: "Rebuild prior" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt on this laptop as v5. Sending.");
  await page.getByRole("button", { name: "Rebuild prior" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt on this laptop as v6. Sending.");
  await page.getByRole("button", { name: "Server refuses the first" }).click();
  await page.waitForTimeout(200);
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt on this laptop as v6. Sending.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Server acknowledges" }).click();
  await expect(page.getByRole("status")).toHaveText("Prior rebuilt as v6.");
});

test("a rebuild refused because another seat moved the prior first says so in plain words", async ({ page }) => {
  await page.goto("/harness/layers.html");
  await page.getByRole("switch", { name: "Near roads, trails and water" }).uncheck();
  await page.getByRole("button", { name: "Rebuild prior" }).click();
  await page.getByRole("button", { name: "Another seat saved first" }).click();
  await expect(page.getByRole("alert")).toHaveText("Another seat updated the map. Showing the newer one.");
});

test("radii stored differently from the sourced table are named as custom, not credited to ISRID", async ({ page }) => {
  await page.goto("/harness/layers.html?terrain=urban&rings=custom");
  await expect(page.getByRole("region", { name: "Prior" })).toContainText("Urban rings, custom radii (0.5, 1, 2.5, 10 km), not the ISRID table, measured in a straight line.");
});

test("a refusal the server did not confirm as a newer prior gets the plain failure line", async ({ page }) => {
  await page.goto("/harness/layers.html");
  await page.getByRole("switch", { name: "Near roads, trails and water" }).uncheck();
  await page.getByRole("button", { name: "Rebuild prior" }).click();
  await page.getByRole("button", { name: "Server refuses the first" }).click();
  await expect(page.getByRole("alert")).toHaveText("The prior was not saved. Try again.");
});

test("an incident's terrain note shows under the ring source line, and nothing shows without one", async ({ page }) => {
  await page.goto("/harness/layers.html?terrain=urban&note=1");
  await expect(page.getByTestId("terrain-note")).toHaveText("Default terrain column (urban), not verified for this site.");
  await page.goto("/harness/layers.html?terrain=urban");
  await expect(page.getByTestId("terrain-note")).toHaveCount(0);
});

test("with no elevation file for the site there is no elevation switch", async ({ page }) => {
  await page.goto("/harness/layers.html");
  await expect(page.getByRole("switch", { name: "Downhill and level ground" })).toHaveCount(0);
});

test("with one, the elevation switch is off, names its source, and asks before it rebuilds", async ({ page }) => {
  await page.goto("/harness/layers.html?elevation=1");
  const s = page.getByRole("region", { name: "Prior" });
  const sw = s.getByRole("switch", { name: "Downhill and level ground" });
  await expect(sw).not.toBeChecked();
  await expect(s).toContainText("ISRID dementia, temperate (Lost Person Behavior p. 164): found 42% downhill, 39% about level and 19% uphill of the point last seen; no n printed.");
  await expect(s).toContainText("About level means within 3 m of the start segment (our rule; the source gives none).");
  await sw.click();
  await expect(s).toContainText("Rebuild the prior? Every team's map and match code change.");
  await s.getByRole("button", { name: "Rebuild prior" }).click();
  await expect(page.getByTestId("applied")).toHaveText('{"linear":true,"wedge":false,"elevation":true} temperate_flat');
});

test("the elevation switch is not used on urban terrain or without the start's elevation", async ({ page }) => {
  await page.goto("/harness/layers.html?elevation=1&terrain=urban");
  const s = page.getByRole("region", { name: "Prior" });
  await expect(s.getByRole("switch", { name: "Downhill and level ground" })).toBeDisabled();
  await expect(s).toContainText("Not used on urban terrain: the source has no urban split.");
  await page.goto("/harness/layers.html?elevation=nostart");
  await expect(page.getByRole("switch", { name: "Downhill and level ground" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Prior" })).toContainText("Needs the start point inside a mapped segment that has an elevation.");
});

test("choosing the urban table turns the elevation switch off", async ({ page }) => {
  await page.goto("/harness/layers.html?elevation=1");
  const s = page.getByRole("region", { name: "Prior" });
  const sw = s.getByRole("switch", { name: "Downhill and level ground" });
  await sw.click();
  await expect(sw).toBeChecked();
  await s.getByRole("combobox", { name: "Distance table" }).selectOption("urban");
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeDisabled();
});

