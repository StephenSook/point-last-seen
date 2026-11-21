import { freshFamilyMember, incidentReadStatus, rejoinStatus } from "./familyConsent";
import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// On the test drill: a fresh family member joins over the public APIs (as the family app does), so its members record
// exists; command removes exactly that account from the People panel. Then that account's next read of the incident is
// refused, and it cannot join again. The member this check makes is the one it removes.
test("command removes a member from the People panel; the account is refused at once and cannot join again", async ({ page }) => {
  test.setTimeout(180_000);
  const incidentId = process.env["PLS_SMOKE_INCIDENT"] ?? "";
  const member = await freshFamilyMember(incidentId);
  expect(await incidentReadStatus(member, incidentId)).toBe(200);
  await withDebugToken(page);
  await joinCommand(page);
  const details = page.getByTestId("rail-details");
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  const row = page.getByRole("region", { name: "People" }).locator(`[data-member="${member.uid}"]`);
  await expect(row).toContainText("Family member", { timeout: 30_000 });
  await row.getByRole("button", { name: "Remove from this drill" }).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toContainText("Removed", { timeout: 30_000 });
  expect(await incidentReadStatus(member, incidentId)).toBe(403);
  expect(await rejoinStatus(member, incidentId)).toBe(403);
});
