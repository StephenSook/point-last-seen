import { expect, test, withDebugToken } from "./fixtures";

// The join form's own checks (no join is attempted, so no join quota is used): each error sits under the field it is
// about, marks that field invalid, names it as the field's description, and takes the focus there.
test("a join error sits under its field, marks it invalid and takes the focus there", async ({ page }) => {
  await withDebugToken(page);
  await page.goto("/");
  const join = page.getByRole("button", { name: "Join as command" });
  await expect(join).toBeEnabled({ timeout: 20_000 });
  const incident = page.getByLabel("Incident id");
  const code = page.getByLabel("Join code");
  await incident.fill("");
  await join.click();
  await expect(incident).toHaveAttribute("aria-invalid", "true");
  await expect(incident).toHaveAccessibleDescription("Enter the incident id.");
  await expect(incident).toBeFocused();
  await expect(code).not.toHaveAttribute("aria-invalid", "true");
  await incident.fill("drill-test-1");
  await code.fill("ABC");
  await join.click();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(code).toHaveAccessibleDescription("The join code has 8 characters.");
  await expect(code).toBeFocused();
  await expect(incident).not.toHaveAttribute("aria-invalid", "true");
});
