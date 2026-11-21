import { expect, test } from "@playwright/test";

// The command post's Reports list: every report, newest first, each one command can take back.
const card = (page: import("@playwright/test").Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

test("lists every report newest first, saying who sent it, what kind, where and when", async ({ page }) => {
  await page.goto("/harness/reports.html");
  const list = page.getByRole("region", { name: "Reports" });
  await expect(list.getByRole("listitem")).toHaveText([
    /^Team 2, found, 14:30/,
    /^Team 1, clue in AC, AD, 14:20/,
    /^Team 1, cleared AA, 14:10/,
    /^Team 2, clue in AB, 14:02/,
    /^Caller, sighting, 13:50/,
  ]);
  await expect(card(page, "Glove by the creek.")).toBeVisible();
});

test("Retract asks first; Keep it changes nothing; Retract report keeps the report, struck through", async ({ page }) => {
  await page.goto("/harness/reports.html");
  const glove = card(page, "Glove by the creek.");
  await glove.getByRole("button", { name: "Retract" }).click();
  await expect(glove).toContainText("Retract this report? It stays in this list, struck through, and stops changing the map.");
  await glove.getByRole("button", { name: "Keep it" }).click();
  await expect(glove.getByRole("button", { name: "Retract" })).toBeVisible();
  await glove.getByRole("button", { name: "Retract" }).click();
  await glove.getByRole("button", { name: "Retract report" }).click();
  await expect(glove).toContainText("Retracted by command.");
  await expect(glove.locator("s", { hasText: "Glove by the creek." })).toBeVisible();
  await expect(glove.getByRole("button", { name: /Retract/ })).toHaveCount(0);
});

test("a report its author took back says so, and the start point's report explains why it is not retracted here", async ({ page }) => {
  await page.goto("/harness/reports.html");
  await expect(card(page, "Hat on the path.")).toContainText("Retracted by its author.");
  const start = card(page, "Man in a blue coat at the gate.");
  await expect(start).toContainText("It set the current start point, so retracting it would not move the start.");
  await expect(start.getByRole("button", { name: "Retract" })).toHaveCount(0);
});

test("a refused retraction says so and leaves the report as it was", async ({ page }) => {
  await page.goto("/harness/reports.html?fail=1");
  const glove = card(page, "Glove by the creek.");
  await glove.getByRole("button", { name: "Retract" }).click();
  await glove.getByRole("button", { name: "Retract report" }).click();
  await expect(glove.getByRole("alert")).toHaveText("The retraction was not saved. Try again.");
  await expect(glove.getByRole("button", { name: "Retract report" })).toBeEnabled();
  await expect(glove).not.toContainText("Retracted by command.");
});
