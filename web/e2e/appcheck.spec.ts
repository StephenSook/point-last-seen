import { randomUUID } from "node:crypto";
import { expect, test, withDebugToken } from "./fixtures";

// A browser App Check does not trust must be told so, never shown a silent
// failure or a wrong-code message. The token below is random and registered
// nowhere, so no real join code is needed: App Check refuses before the code is read.
// An empty browser: the run's saved session carries a valid cached App Check token, which would
// be used instead of the unregistered one.
test.use({ storageState: { cookies: [], origins: [] } });

test("an unregistered App Check token shows the refusal message at join", async ({ page }) => {
  const unregistered = randomUUID();
  await page.addInitScript((t) => { (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, unregistered);
  await page.goto("/");
  await page.getByLabel("Incident id").fill("drill-test-1");
  await page.getByLabel("Join code").fill("ABCD2345");
  await page.getByRole("button", { name: "Join as command" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This browser did not pass the site's security check. Reload the page and try again; if it fails again, try a normal browser window.",
    { timeout: 20_000 },
  );
  // A reload clears the SDK's back-off and reads a stored token again, so the refusal offers one.
  const reload = page.getByRole("button", { name: "Reload page" });
  await expect(reload).toBeVisible();
  await Promise.all([page.waitForEvent("load"), reload.click()]);
  await expect(page.getByLabel("Join code")).toHaveValue("");
});

test("a wrong join code says so and offers no reload", async ({ page }) => {
  await withDebugToken(page);
  await page.goto("/");
  await page.getByLabel("Incident id").fill("drill-test-1");
  await page.getByLabel("Join code").fill("ABCD2345");
  await page.getByRole("button", { name: "Join as command" }).click();
  await expect(page.getByRole("alert")).toHaveText("That code did not match this incident.", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Reload page" })).toHaveCount(0);
});
