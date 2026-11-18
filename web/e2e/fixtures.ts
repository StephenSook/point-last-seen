import { test as base, expect, type Page } from "@playwright/test";

/** Sets the registered App Check debug token before the app starts. The token comes from the environment, never from the repo. */
export async function withDebugToken(page: Page): Promise<void> {
  const token = process.env["PLS_APPCHECK_DEBUG_TOKEN"];
  if (!token) throw new Error("PLS_APPCHECK_DEBUG_TOKEN is not set");
  await page.addInitScript((t) => {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
  }, token);
}

/** Collects console errors and uncaught page errors for the whole test. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    // Console lines for failed loads carry no URL, so record each failing response too.
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().split("?")[0]}`);
    });
    await use(errors);
  },
});

export { expect };
