import { expect, test } from "@playwright/test";

test("each prior layer shows its source and n, and the wedge says what it needs", async ({ page }) => {
  await page.goto("/harness/layers.html");
  const s = page.getByRole("region", { name: "Prior" });
  await expect(s).toContainText("n = 175");
  await expect(s).toContainText("71 m");
  await expect(s).toContainText("our rule, not ISRID's");
  await expect(s.getByRole("switch", { name: "Direction of travel" })).toBeDisabled();
  await expect(s).toContainText("Needs a confirmed direction of travel.");
  await expect(s).toContainText("Vehicle involved: these distances assume travel on foot.");
  await expect(s.getByRole("combobox", { name: "Distance table" })).toHaveValue("temperate_flat");
  await expect(s.getByRole("option", { name: /Temperate flat \(default, not verified for this site\)/ })).toBeAttached();
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
