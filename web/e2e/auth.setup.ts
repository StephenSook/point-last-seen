import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE } from "./authState";
import { joinCommand, withDebugToken } from "./fixtures";

// One anonymous sign-in per run, saved (with IndexedDB, where Firebase keeps the user) and
// reused by every test. Signing up afresh in each test context hit Firebase Auth's per-IP
// limit for anonymous sign-ups (TOO_MANY_ATTEMPTS_TRY_LATER) after a few full runs.
// The file holds a test session's tokens: it lives in the gitignored e2e/.auth.

setup("sign in once for the run", async ({ page }) => {
  // With the drill fixture present the session also joins once (joinIncident allows 10 joins per user per hour).
  const joins = !!(process.env["PLS_SMOKE_INCIDENT"] && process.env["PLS_SMOKE_JOIN_CODE"] && process.env["PLS_APPCHECK_DEBUG_TOKEN"]);
  if (joins) {
    await withDebugToken(page);
    await joinCommand(page);
  } else {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Join as command" })).toBeEnabled({ timeout: 20_000 });
    // The join page fetches neither cache below (the command post starts both), so there is nothing more to save.
    await page.context().storageState({ path: AUTH_STATE, indexedDB: true });
    return;
  }
  // Remote Config keeps its last fetch in IndexedDB (firebase_remote_config) and Performance Monitoring keeps its
  // config in localStorage. Saving before they are written left every test to fetch both again, about two fetches a
  // test, and the project allows 60 a minute per caller: a full run was refused partway with HTTP 429. Wait for both
  // caches so every test reuses them for the 12 hours the SDKs keep them.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open("firebase_remote_config");
              open.onerror = () => resolve(false);
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains("app_namespace_store")) return (db.close(), resolve(false));
                const get = db.transaction("app_namespace_store", "readonly").objectStore("app_namespace_store").getAllKeys();
                get.onsuccess = () => (db.close(), resolve(get.result.some((k) => String(k).includes("last_successful_fetch_timestamp_millis"))));
                get.onerror = () => (db.close(), resolve(false));
              };
            }),
        ),
      { timeout: 30_000, message: "Remote Config's fetch was never stored in this browser" },
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("@firebase/performance/config") !== null), { timeout: 30_000, message: "Performance Monitoring's config was never stored" })
    .toBe(true);
  await page.context().storageState({ path: AUTH_STATE, indexedDB: true });
});
