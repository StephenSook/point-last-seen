import { AI_HOSTS, expect, test, withDebugToken } from "./fixtures";

test("with no built-in model D2 shows the no-model message and sends nothing", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const hits: string[] = [];
  page.on("request", (r) => { if (AI_HOSTS.test(r.url())) hits.push(r.url()); });
  await page.goto("/judge");
  await expect(page.getByRole("heading", { name: "Judge's door" })).toBeVisible();
  await page.getByRole("button", { name: "Get this laptop ready" }).click();
  await expect(page.getByTestId("d2-state")).toHaveAttribute("data-state", "no-model");
  // The site publishes a drill run, so the line points at its replay.
  await expect(page.getByTestId("d2-state")).toHaveText("This browser has no built-in model. Nothing private was sent. The replay above shows a recorded drill run.");
  expect(hits).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("with no published run the page says so once and offers a practice search first", { tag: "@no-backend" }, async ({ page }) => {
  await page.route("**/evidence/published-run.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/judge");
  await expect(page.getByRole("region", { name: "Replay the training drill" }).getByText("No published run yet.")).toBeVisible();
  await expect(page.getByText("No published run yet.")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Numbers" })).toHaveCount(0);
  const practice = page.getByRole("region", { name: "Try a practice search" });
  await expect(practice.getByRole("button", { name: "Try a practice search" })).toBeVisible();
  await expect(page.getByText("Training drill. Nobody is missing.")).toBeVisible();
});

test("a practice search opens a labelled training incident on the real park map, with no code", async ({ page }) => {
  await withDebugToken(page);
  await page.goto("/judge");
  await page.getByRole("button", { name: "Try a practice search" }).click();
  await expect(page).toHaveURL(/\?incident=judge-/, { timeout: 30_000 });
  await expect(page.locator(".post-head")).toContainText("Training drill. Practice search; nobody is missing.", { timeout: 20_000 });
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".post-head")).toContainText("MATCH");
});

// The start callable answered here instead of by the server, so these checks never use up practice searches.
const SETUP = "Your practice search is still being set up. Try again in a moment.";
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };
const busyReply = { status: 503, headers: CORS, body: JSON.stringify({ error: { status: "UNAVAILABLE", message: SETUP, details: { reason: "setup_busy" } } }) };
const seatReply = { status: 200, headers: CORS, body: JSON.stringify({ result: { incidentId: "judge-stubbed-seat", role: "command" } }) };

test("a start the server is still setting up says so, then opens the practice incident when it answers", async ({ page }) => {
  await withDebugToken(page);
  let posts = 0;
  await page.route("**/startJudgeSession", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    return route.fulfill(posts === 1 ? busyReply : seatReply);
  });
  await page.goto("/judge");
  await page.getByRole("button", { name: "Try a practice search" }).click();
  const practice = page.getByRole("region", { name: "Try a practice search" });
  await expect(practice.getByRole("status")).toHaveText("Your practice search is still being set up. This page opens it when it is ready.");
  await expect(practice.getByRole("button", { name: "Starting" })).toBeDisabled();
  await expect(page).toHaveURL(/\?incident=judge-stubbed-seat/, { timeout: 15_000 });
  expect(posts).toBe(2);
});

test("a 503 without the server's sentence says No connection and does not start again", async ({ page }) => {
  await withDebugToken(page);
  let posts = 0;
  await page.route("**/startJudgeSession", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    return route.fulfill({ status: 503, headers: CORS, body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "Service Unavailable" } }) });
  });
  await page.goto("/judge");
  await page.getByRole("button", { name: "Try a practice search" }).click();
  const practice = page.getByRole("region", { name: "Try a practice search" });
  await expect(practice.getByRole("alert")).toHaveText("No connection. Try again when the link is back.");
  await page.waitForTimeout(3_500);
  expect(posts).toBe(1);
  await expect(practice.getByRole("button", { name: "Try a practice search" })).toBeEnabled();
});

test("with no connection the start says No connection and does not start again", async ({ page }) => {
  await withDebugToken(page);
  let posts = 0;
  await page.route("**/startJudgeSession", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    return route.abort("internetdisconnected");
  });
  await page.goto("/judge");
  await page.getByRole("button", { name: "Try a practice search" }).click();
  const practice = page.getByRole("region", { name: "Try a practice search" });
  await expect(practice.getByRole("alert")).toHaveText("No connection. Try again when the link is back.");
  await page.waitForTimeout(3_500);
  expect(posts).toBe(1);
});

test("two clicks in the same moment start one practice search", async ({ page }) => {
  await withDebugToken(page);
  let posts = 0;
  await page.route("**/startJudgeSession", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    await new Promise((r) => setTimeout(r, 800));
    return route.fulfill(seatReply);
  });
  await page.goto("/judge");
  // Two clicks in one task, before React can disable the button: only the page's own guard stops the second.
  await page.getByRole("button", { name: "Try a practice search" }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page).toHaveURL(/\?incident=judge-stubbed-seat/, { timeout: 15_000 });
  expect(posts).toBe(1);
});

test("the judge page names the cloud model Remote Config selects right now", async ({ page }) => {
  await page.goto("/judge");
  const s = page.getByRole("region", { name: "Cloud model" });
  // The project's template is published (version 1, 2026-11-18), so the value must come from Remote Config, not the page's default.
  await expect(s).toContainText(/Cloud model now: gemini-[0-9.]+-flash-lite\./, { timeout: 15_000 });
  await expect(s).not.toContainText("(default)");
  // Where it came from, with the fetch time and its time zone, sits under one closed Details line.
  const details = page.getByRole("group").filter({ has: page.getByText("Details", { exact: true }) });
  await expect(details.getByText(/Chosen by Remote Config/)).toBeHidden();
  await details.getByText("Details", { exact: true }).click();
  await expect(details).toContainText(/Chosen by Remote Config \(fetched [0-9]{2}:[0-9]{2}:[0-9]{2} [A-Z][A-Za-z0-9+-]+\)/, { timeout: 15_000 });
  await expect(details).toContainText("Measured on Chrome");
});

test("the join page says what the product does and sends judges to the judge's door", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("purpose")).toHaveText("Plans where to search for a missing person, and updates the map as reports come in.");
  const link = page.getByRole("link", { name: "Judges: start here" });
  await expect(link).toHaveAttribute("href", "/judge");
  await link.click();
  await expect(page.getByRole("heading", { name: "Judge's door" })).toBeVisible();
});

test("/llms.txt says what the site is and where a judge starts", { tag: "@no-backend" }, async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
  const text = await res.text();
  expect(text).toMatch(/^# Point Last Seen/);
  expect(text).toContain("/judge");
});
