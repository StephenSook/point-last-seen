import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE } from "./authState";
import { joinCommand, withDebugToken } from "./fixtures";

// One anonymous sign-in per run, saved (with IndexedDB, where Firebase keeps the user) and
// reused by every test. Signing up afresh in each test context hit Firebase Auth's per-IP
// limit for anonymous sign-ups (TOO_MANY_ATTEMPTS_TRY_LATER) after a few full runs.
// The file holds a test session's tokens: it lives in the gitignored e2e/.auth.

setup("sign in once for the run", async ({ page }) => {
  // With the drill fixture present the session also joins once (joinIncident allows 10 joins per user per hour).
  if (process.env["PLS_SMOKE_INCIDENT"] && process.env["PLS_SMOKE_JOIN_CODE"] && process.env["PLS_APPCHECK_DEBUG_TOKEN"]) {
    await withDebugToken(page);
    await joinCommand(page);
  } else {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Join as command" })).toBeEnabled({ timeout: 20_000 });
  }
  await page.context().storageState({ path: AUTH_STATE, indexedDB: true });
});
