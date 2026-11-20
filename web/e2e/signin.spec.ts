import { expect, test, withDebugToken } from "./fixtures";

// A failed anonymous sign-in leaves the join form disabled (a join without a user can only fail,
// and its error would blame the code) and offers one Try again that signs in afresh.
// It starts from an empty browser so the page has to sign up; it costs one sign-up per run.
test.use({ storageState: { cookies: [], origins: [] } });

test("a failed sign-in disables the join form, says why, and Try again signs in", async ({ page }) => {
  await withDebugToken(page);
  await page.route(/accounts:signUp/, (r) => r.abort("internetdisconnected"));
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText("No connection. Try again when the link is back.", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Join as command" })).toBeDisabled();
  await page.getByLabel("Incident id").fill("drill-test-1");
  await page.unroute(/accounts:signUp/);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Join as command" })).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByLabel("Incident id")).toHaveValue("drill-test-1");
});
