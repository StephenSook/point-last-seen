import { deployedOnly, expect, test } from "./fixtures";

// A judge whose browser fails the site's security check (App Check): a fresh profile with no debug token, every App
// Check exchange refused. The practice search cannot start, since the server checks every browser, and the page must
// say so plainly within seconds, keep the button usable and throw nothing. The start call is answered in the page with
// the server's own refusal (HTTP 401, as the deployed function answered with App Check failing), so this check can
// never start a practice search or spend the judges' daily quota.
test.use({ storageState: { cookies: [], origins: [] } });
test("with the security check failing, the judge door says why the practice search cannot start, and nothing hangs", async ({ page }) => {
  deployedOnly();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.route("**/startJudgeSession", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "Unauthenticated", status: "UNAUTHENTICATED" } }) }),
  );
  await page.route(/exchangeRecaptchaEnterpriseToken/, (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: 403, message: "App attestation failed.", status: "PERMISSION_DENIED" } }) }),
  );
  await page.goto("/judge");
  await expect(page.getByRole("heading", { name: "Judge's door" })).toBeVisible();
  const practice = page.getByRole("region", { name: "Try a practice search" });
  await practice.getByRole("button", { name: "Try a practice search" }).click();
  await expect(practice.getByRole("alert")).toHaveText(
    "This browser did not pass the site's security check, so a practice search cannot start. Nothing private was sent. Reload and try again; the drill replay on this page plays without it.",
    { timeout: 30_000 },
  );
  await expect(page).toHaveURL(/\/judge$/);
  await expect(practice.getByRole("button", { name: "Try a practice search" })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Replay the training drill" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
