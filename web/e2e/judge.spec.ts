import { AI_HOSTS, expect, test } from "./fixtures";

test("with no built-in model D2 shows the no-model message and sends nothing", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const hits: string[] = [];
  page.on("request", (r) => { if (AI_HOSTS.test(r.url())) hits.push(r.url()); });
  await page.goto("/judge");
  await expect(page.getByRole("heading", { name: "Judge's door" })).toBeVisible();
  await page.getByRole("button", { name: "Get this laptop ready" }).click();
  await expect(page.getByTestId("d2-state")).toHaveAttribute("data-state", "no-model");
  await expect(page.getByTestId("d2-state")).toHaveText("This browser has no built-in model. Nothing private was sent.");
  await expect(page.getByText(/replay above/)).toHaveCount(0);
  expect(hits).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("before a run is published the page says so", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByRole("region", { name: "Numbers" }).getByText("No published run yet.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Replay the training drill" }).getByText("No published run yet.")).toBeVisible();
  await expect(page.getByText("Training drill. Nobody is missing.")).toBeVisible();
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

test("the join page says what the product does and sends judges to the judge's door", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("purpose")).toHaveText("Plans where to search for a missing person, and updates the map as reports come in.");
  const link = page.getByRole("link", { name: "Judges: start here" });
  await expect(link).toHaveAttribute("href", "/judge");
  await link.click();
  await expect(page.getByRole("heading", { name: "Judge's door" })).toBeVisible();
});

test("/llms.txt says what the site is and where a judge starts", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
  const text = await res.text();
  expect(text).toMatch(/^# Point Last Seen/);
  expect(text).toContain("/judge");
});
