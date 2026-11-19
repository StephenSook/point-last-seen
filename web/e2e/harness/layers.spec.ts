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
  await page.getByRole("button", { name: "Server refuses the first" }).click();
  await expect(page.getByRole("alert")).toHaveText("Another seat updated the map. Showing the newer one.");
});
