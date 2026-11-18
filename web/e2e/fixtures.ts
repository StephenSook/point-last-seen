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

/** Joins the seeded drill incident as command. Under CI a missing fixture fails; it never skips. */
export async function joinCommand(page: Page): Promise<string> {
  const incident = process.env["PLS_SMOKE_INCIDENT"];
  const code = process.env["PLS_SMOKE_JOIN_CODE"];
  if (!incident || !code) throw new Error("PLS_SMOKE_INCIDENT and PLS_SMOKE_JOIN_CODE are required");
  await page.goto(`/?incident=${encodeURIComponent(incident)}`);
  await page.getByLabel("Join code").fill(code);
  await page.getByRole("button", { name: "Join as command" }).click();
  await expect(page.getByTestId("convergence-code")).toBeVisible();
  return incident;
}

/** A synthetic sign image drawn in the page (no personal photo), as JPEG bytes for a file input. */
export async function syntheticSignJpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(768, 512);
    const g = c.getContext("2d")!;
    g.fillStyle = "#f2efe8"; g.fillRect(0, 0, 768, 512);
    g.fillStyle = "#1b3a5c"; g.fillRect(64, 96, 640, 260);
    g.fillStyle = "#ffffff"; g.font = "bold 72px sans-serif"; g.fillText("HARDWARE", 170, 210);
    g.font = "bold 48px sans-serif"; g.fillText("OPEN 8-6", 260, 300);
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

/** POST requests to the AI Logic and Gemini hosts. Preflights are not counted. */
export const AI_HOSTS = /firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com|firebaseml\.googleapis\.com/;
