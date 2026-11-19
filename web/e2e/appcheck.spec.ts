import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";

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
  await expect(page.getByRole("alert")).toHaveText("Join refused by App Check. Try a normal browser window.", { timeout: 20_000 });
});
