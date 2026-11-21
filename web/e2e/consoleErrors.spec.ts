import { expect, test } from "./fixtures";

// The no-backend run serves a build made with placeholder keys (ci-build-check): its App Check token request and
// its anonymous sign-up are refused by Google with HTTP 400, at a moment that races a check's last line. Those two
// refusals, carrying the placeholder key, are expected noise there; anything else is still an error.
test("the console error fixture ignores only the placeholder keys' refused App Check and sign-up", { tag: ["@no-backend", "@placeholder-build"] }, async ({ page, consoleErrors }) => {
  const refused = (part: string) => page.waitForResponse((r) => r.url().includes(part) && r.status() >= 400, { timeout: 30_000 });
  const appCheck = refused("recaptcha/enterprise/clr");
  const signUp = refused("accounts:signUp");
  await page.goto("/");
  const urls = (await Promise.all([appCheck, signUp])).map((r) => r.url());
  expect(urls.every((u) => /[?&]k(ey)?=ci-build-check(&|$)/.test(u))).toBe(true);
  await page.waitForTimeout(500);
  expect(consoleErrors).toEqual([]);
  // Control: the same sign-up refused for any other key is still an error.
  await page.evaluate(() => fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=not-the-placeholder", { method: "POST" }).catch(() => undefined));
  await expect.poll(() => consoleErrors.some((e) => e.startsWith("HTTP 400 POST https://identitytoolkit.googleapis.com/v1/accounts:signUp"))).toBe(true);
});
