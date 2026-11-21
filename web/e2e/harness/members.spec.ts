import { expect, test } from "@playwright/test";

test("the People panel lists searchers and family, never command", async ({ page }) => {
  await page.goto("/harness/members.html");
  const panel = page.getByRole("region", { name: "People" });
  await expect(panel.getByRole("listitem")).toHaveText([/Family member/, /Team 1 searcher/, /Team 2 searcher/]);
  await expect(panel).not.toContainText("command", { ignoreCase: true });
});

test("Remove from this drill asks first; Cancel removes nothing; Remove marks the person removed", async ({ page }) => {
  await page.goto("/harness/members.html");
  const row = page.getByRole("region", { name: "People" }).getByRole("listitem").filter({ hasText: "Team 2 searcher" });
  await row.getByRole("button", { name: "Remove from this drill" }).click();
  await expect(row).toContainText("They lose access at once and cannot join again.");
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(row.getByRole("button", { name: "Remove from this drill" })).toBeVisible();
  await row.getByRole("button", { name: "Remove from this drill" }).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toContainText("Removed");
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("a refused removal says why and keeps the confirm open", async ({ page }) => {
  await page.goto("/harness/members.html?fail=command_target");
  const row = page.getByRole("region", { name: "People" }).getByRole("listitem").filter({ hasText: "Team 1 searcher" });
  await row.getByRole("button", { name: "Remove from this drill" }).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText("Command cannot be removed.");
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toBeEnabled();
});

test("someone already removed shows Removed and offers no action", async ({ page }) => {
  await page.goto("/harness/members.html?removed=1");
  const row = page.getByRole("region", { name: "People" }).getByRole("listitem").filter({ hasText: "Family member" });
  await expect(row).toContainText("Removed");
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("a successful removal shows Removed at once, before the removal record arrives, so it cannot be sent twice", async ({ page }) => {
  await page.goto("/harness/members.html?noecho=1");
  const row = page.getByRole("region", { name: "People" }).getByRole("listitem").filter({ hasText: "Team 2 searcher" });
  await row.getByRole("button", { name: "Remove from this drill" }).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toContainText("Removed");
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("once a list read is refused, the panel says it may be out of date and offers no removal", async ({ page }) => {
  await page.goto("/harness/members.html?stale=1");
  const panel = page.getByRole("region", { name: "People" });
  await expect(panel).toContainText("This list may be out of date. Reload the page before removing anyone.");
  await expect(panel.getByRole("button", { name: "Remove from this drill" })).toHaveCount(0);
});

test("a refused read with no one to list still says the list may be out of date", async ({ page }) => {
  await page.goto("/harness/members.html?stale=1&empty=1");
  await expect(page.getByRole("region", { name: "People" })).toContainText("This list may be out of date.");
});
