import { deployedOnly, expect, joinCommand, openDetails, test, withDebugToken } from "./fixtures";

// The rail leads with what the newest report did, the plan and the top segments; the sections command opens less
// often (family, the prior, family photos, debriefs, reports by team, and the conditions once set) wait under a
// closed Details, whose summary counts what needs a person.
test("the rail leads with what changed, the plan and the top segments; the rest waits under Details", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const rail = page.locator(".rail.right");
  const outside = await rail.evaluate((el) => [...el.querySelectorAll("h2")].filter((h) => !h.closest("details.rail-details")).map((h) => h.id));
  const lead = outside.filter((id) => ["change-h", "plan-h", "rank-h"].includes(id));
  expect(lead).toEqual(outside.slice(0, lead.length));
  expect(lead).toEqual(expect.arrayContaining(["plan-h", "rank-h"]));
  const details = page.getByTestId("rail-details");
  await expect(details).not.toHaveAttribute("open", "");
  const inside = await details.evaluate((el) => [...el.querySelectorAll("h2")].map((h) => h.id));
  for (const id of ["family-h", "model-h", "prior-h", "photos-h", "debrief-h"]) expect(inside, id).toContain(id);
  // The conditions stay in view until they are set; once set they move under Details and the summary reads them.
  const summary = page.getByTestId("rail-details-summary");
  await expect(summary).toHaveText(/^Details(: .+\.)?$/);
  const set = /°F|temperature not known/.test(await summary.innerText());
  expect(set ? inside : outside, "conditions-h").toContain("conditions-h");
  await expect(page.getByRole("region", { name: "Family", exact: true })).toBeHidden();
  await openDetails(page);
  await expect(page.getByRole("region", { name: "Family", exact: true })).toBeVisible();
  // Opening Details marks the family's answers as seen: the summary no longer counts any.
  await expect(summary).not.toContainText("family answer");
});
