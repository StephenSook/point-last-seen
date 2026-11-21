import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The judge's seeded incident, from the shared constant (its id is never typed in a test). Live tests write
// sightings, photos, consents and plans, so they run on the test drill and refuse the judge's seed.
const JUDGE_SEED = (JSON.parse(readFileSync(new URL("../../shared/constants/judge-seed.json", import.meta.url), "utf8")) as { incidentId: string }).incidentId;

export function refuseJudgeSeed(incidentId: string): void {
  if (incidentId === JUDGE_SEED) throw new Error("This is the judge's seed incident; live tests run on the test drill (PLS_SMOKE_INCIDENT=drill-test-1).");
}

/** Sets the registered App Check debug token before the app starts. The token comes from the environment, never from the repo. */
export async function withDebugToken(page: Page): Promise<void> {
  const token = process.env["PLS_APPCHECK_DEBUG_TOKEN"];
  if (!token) throw new Error("PLS_APPCHECK_DEBUG_TOKEN is not set");
  await page.addInitScript((t) => {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
  }, token);
}

/**
 * Deployed-only checks: photo reads go through Storage, and the production bucket's CORS trusts only the
 * two hosting origins, so these checks mean something only on the deployed site. A local run fails here
 * with this message; it never skips, so a local run cannot be read as a pass.
 */
export function deployedOnly(): void {
  if (!process.env["BASE_URL"]) {
    throw new Error("Deployed-only check: run with BASE_URL=https://buildhybridai-2026-yg3m.web.app (the production bucket's CORS trusts only the hosting origins).");
  }
}

// The no-backend run's build carries placeholder keys (ci-build-check). Google refuses its App Check token request
// and its anonymous sign-up with HTTP 400, at a moment that races a check's last line. Only those two refusals,
// with the placeholder key in the URL, are not counted; the live site's keys never match.
const PLACEHOLDER_REFUSAL = /^https:\/\/(?:www\.google\.com\/recaptcha\/enterprise\/clr\?k=ci-build-check|identitytoolkit\.googleapis\.com\/v1\/accounts:signUp\?key=ci-build-check)(?:&|$)/;

/** Collects console errors and uncaught page errors for the whole test. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !PLACEHOLDER_REFUSAL.test(m.location().url)) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    // Console lines for failed loads carry no URL, so record each failing response too.
    page.on("response", (r) => {
      if (r.status() >= 400 && !(r.status() === 400 && PLACEHOLDER_REFUSAL.test(r.url()))) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().split("?")[0]}`);
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
  refuseJudgeSeed(incident);
  await page.goto(`/?incident=${encodeURIComponent(incident)}`);
  // The run's saved session has usually joined already (auth.setup.ts), so the post opens directly;
  // joinIncident allows 10 joins per user per hour, so tests join only when the form asks.
  const post = page.getByTestId("convergence-code");
  const join = page.getByRole("button", { name: "Join as command" });
  // joinIncident can start cold, and parallel workers start at the same moment.
  await expect(post.or(join)).toBeVisible({ timeout: 20_000 });
  if (!(await post.isVisible())) {
    await page.getByLabel("Join code").fill(code);
    await join.click();
  }
  await expect(post).toBeVisible({ timeout: 20_000 });
  return incident;
}

/**
 * Waits until the map has drawn the drill's cells: every cell's code is in the page (shown or not; on a phone the
 * cells are too small for codes until zoomed in) and the map has settled.
 */
export async function mapDrawn(page: Page): Promise<void> {
  await expect(page.locator(".seg-code").first()).toBeAttached({ timeout: 20_000 });
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
}

/** Opens the command post rail's Details (conditions, family, prior, photos, debriefs), closed when the post opens. */
export async function openDetails(page: Page): Promise<void> {
  const details = page.getByTestId("rail-details");
  await expect(details).toBeAttached({ timeout: 20_000 });
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
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
