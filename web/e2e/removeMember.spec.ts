import { expect, test, withDebugToken } from "./fixtures";

// On a fresh practice copy (never the test drill). Its reports were copied from the seed, so their authors are accounts
// of the seed incident, not of this copy: the People panel lists them, and removing one reaches removeMember, which
// refuses it as not a member of this search. That proves the call is wired and accepted by App Check, and removes no one.
test.use({ storageState: { cookies: [], origins: [] } });

test("the People panel lists the practice copy's report authors, and a removal reaches the server and is refused for a non-member", async ({ page }) => {
  test.setTimeout(180_000);
  await withDebugToken(page);
  await page.goto("/judge");
  await page.getByRole("button", { name: "Try a practice search" }).click();
  await expect(page).toHaveURL(/\?incident=judge-/, { timeout: 60_000 });
  const details = page.getByTestId("rail-details");
  await expect(details).toBeVisible({ timeout: 30_000 });
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  const people = page.getByRole("region", { name: "People" });
  await expect(people.getByRole("listitem").filter({ hasText: "Family member" })).toBeVisible({ timeout: 30_000 });
  await expect(people).not.toContainText("command", { ignoreCase: true });
  const row = people.getByRole("listitem").filter({ hasText: "Family member" }).first();
  await row.getByRole("button", { name: "Remove from this drill" }).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row.getByRole("alert")).toHaveText("That person is no longer in this search.", { timeout: 30_000 });
});
