import { deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// A team's search report typed into the sighting form is caught at Save, and can go to its cleared segment's
// debrief instead. Writes nothing: the debrief form opens with the note in it and is cancelled.
test("a search report typed as a sighting goes to its cleared segment's debrief, with nothing saved", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const rows = page.locator('[data-testid^="debrief-"]');
  await expect(rows.first()).toBeAttached({ timeout: 20_000 });
  const id = (await rows.first().getAttribute("data-testid"))!.slice("debrief-".length);
  await page.getByRole("button", { name: "Add sighting" }).click();
  await page.getByRole("combobox", { name: /^Place\b/ }).selectOption(id);
  await page.getByLabel(/^Note/).fill(`Segment ${id} searched, no sign.`);
  await page.getByRole("button", { name: "Save sighting" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This reads as a search report, not a sighting." })).toBeVisible();
  await page.getByRole("button", { name: `Add it to segment ${id}'s debrief` }).click();
  await expect(page.getByRole("button", { name: "Save sighting" })).toHaveCount(0);
  await expect(page.getByTestId("rail-details")).toHaveAttribute("open", "");
  const row = page.getByTestId(`debrief-${id}`);
  const worked = row.getByLabel("What worked (optional)");
  await expect(worked).toHaveValue(new RegExp(`Segment ${id} searched, no sign\\.$`));
  await expect(worked).toBeFocused();
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(worked).toHaveCount(0);
});
