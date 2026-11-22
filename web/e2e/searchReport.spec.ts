import { deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// A team's search report typed into the sighting form is caught at Save, and can open its cleared segment's debrief.
// Writes nothing: the debrief form opens and is cancelled, and so is the sighting.
test("a search report typed as a sighting opens its cleared segment's debrief, with nothing saved", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const rows = page.locator('[data-testid^="debrief-"]');
  await expect(rows.first()).toBeAttached({ timeout: 20_000 });
  const ids = (await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!.slice("debrief-".length))));
  await page.getByRole("button", { name: "Add sighting" }).click();
  const form = page.locator("form.sighting-form");
  const place = form.getByRole("combobox", { name: /^Place\b/ });
  await place.selectOption(ids[0]!);
  await form.getByLabel(/^Note/).fill("Searched the segment, no sign.");
  await form.getByRole("button", { name: "Save sighting" }).click();
  await expect(form.getByRole("alert").filter({ hasText: "This reads as a search report, not a sighting." })).toBeVisible();
  // A debrief row can stay for a segment whose clear was taken back; the offer comes only for one that stands cleared.
  let id: string | undefined;
  for (const candidate of ids) {
    await place.selectOption(candidate);
    if (await form.getByRole("button", { name: `Open segment ${candidate}'s debrief` }).isVisible()) {
      id = candidate;
      break;
    }
  }
  expect(id, "a segment of the drill that stands cleared").toBeDefined();
  await form.getByRole("button", { name: `Open segment ${id}'s debrief` }).click();
  // The sighting draft stays as it is beside the debrief.
  await expect(form.getByRole("status").filter({ hasText: `Segment ${id}'s debrief was opened below.` })).toBeVisible();
  await expect(form.getByLabel(/^Note/)).toHaveValue("Searched the segment, no sign.");
  await expect(page.getByTestId("rail-details")).toHaveAttribute("open", "");
  const row = page.getByTestId(`debrief-${id}`);
  const worked = row.getByLabel("What worked (optional)");
  await expect(worked).toBeFocused();
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(worked).toHaveCount(0);
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
});
