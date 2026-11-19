import { expect, test, type Page } from "@playwright/test";

// The link drops after the page has loaded: everything here must run from what is already in memory.
async function loadThenCutTheLink(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.context().setOffline(true);
}

async function open(page: Page, name: string) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name }).click();
}

test("print, export, radio check and replay still work with the link down", async ({ page }) => {
  await loadThenCutTheLink(page, "/extras-harness/print.html");

  await open(page, "Print assignment sheet");
  await expect(page.locator("[data-block]")).toHaveCount(9);
  await page.keyboard.press("Escape");

  await open(page, "Print radio cards");
  await expect(page.getByRole("dialog", { name: "Print radio cards" })).toBeVisible();
  await page.keyboard.press("Escape");

  await open(page, "Check a radio code");
  const check = page.getByRole("dialog", { name: "Check a radio code" });
  await check.getByRole("textbox").fill("k7-q4");
  await expect(check).toContainText("Same map");
  await page.keyboard.press("Escape");

  const downloaded = page.waitForEvent("download");
  await open(page, "Export GeoJSON");
  expect((await downloaded).suggestedFilename()).toMatch(/\.geojson$/);

  // This page's reports have not arrived, so the replay says so; the replay page below checks the slider.
  await open(page, "Replay");
  await expect(page.getByRole("dialog", { name: "Replay" })).toContainText("No report has arrived yet, so there is nothing to replay.");
});

test("the replay runs with the link down", async ({ page }) => {
  await loadThenCutTheLink(page, "/extras-harness/replay.html");
  await open(page, "Replay");
  const dialog = page.getByRole("dialog", { name: "Replay" });
  await expect(dialog.getByTestId("replay-code")).toHaveText((await page.getByTestId("live-code").textContent())!);
  await dialog.getByRole("button", { name: "Previous report" }).click();
  await expect(dialog.getByRole("slider", { name: "Replay time" })).toBeVisible();
});
