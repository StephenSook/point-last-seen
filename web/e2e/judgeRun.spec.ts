import { expect, test, type Page } from "@playwright/test";
import { harnessRun } from "../src/extras/testdata/replayIncident";

// The judge page with a published run file served by the test, not the backend. The run is the replay
// harness's made-up data; the page reads it with the same reader the replay uses.
const RUN_URL = "**/evidence/published-run.json";

async function serveRun(page: Page, body: string): Promise<void> {
  await page.route(RUN_URL, (route) => route.fulfill({ status: 200, contentType: "application/json", body }));
}

test("a published run replays in one section, labelled as a training drill", { tag: "@no-backend" }, async ({ page }) => {
  await serveRun(page, JSON.stringify(harnessRun()));
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  await page.goto("/judge");
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  await expect(section.getByTestId("replay-code")).toHaveText(/^[0-9A-Z]{4}$/);
  await expect(section.locator(".plate").first()).toBeVisible();
  await expect(section.getByRole("slider", { name: "Replay time" })).toBeVisible();
  // The replay map credits OpenStreetMap like every other map view.
  await expect(section.getByTestId("map-credit").getByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();
  await expect(section.getByText("Training drill. Nobody is missing.", { exact: true })).toBeVisible();
  // One replay section: the page's own placeholder is gone and "No published run yet." is never said.
  await expect(page.getByRole("region", { name: "Replay the training drill" })).toHaveCount(0);
  await expect(page.getByText("No published run yet.")).toHaveCount(0);
  await expect(page.getByText(/once the sandbox is live/)).toHaveCount(0);
  // With no built-in model, the laptop line points at the replay that is there.
  await page.getByRole("button", { name: "Get this laptop ready" }).click();
  await expect(page.getByTestId("d2-state")).toHaveText("This browser has no built-in model. Nothing private was sent. The replay above shows a recorded drill run.");
});

test("a run the replay cannot read says why, once, and replays nothing", { tag: "@no-backend" }, async ({ page }) => {
  const run = harnessRun();
  await serveRun(page, JSON.stringify({ ...run, events: run.events.map((e, i) => (i === 0 ? { ...e, serverTimeMs: undefined } : e)) }));
  await page.goto("/judge");
  await expect(page.getByTestId("replay-refused")).toHaveText("This run cannot be replayed. The run has no arrival time for a report.");
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Replay the training drill" })).toHaveCount(0);
  await expect(page.getByText("No published run yet.")).toHaveCount(0);
});

test("a run file that is not JSON is called unreadable, not missing", { tag: "@no-backend" }, async ({ page }) => {
  await serveRun(page, "not json");
  await page.goto("/judge");
  await expect(page.getByRole("region", { name: "Replay the training drill" }).getByText("The published run file can't be read, so nothing is replayed and no numbers are shown.")).toBeVisible();
  await expect(page.getByText("No published run yet.")).toHaveCount(0);
});

test("the site serves its published drill run, and the judge page replays it", { tag: "@no-backend" }, async ({ page, request }) => {
  const res = await request.get("/evidence/published-run.json");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  const file = (await res.json()) as { label: string; runId: string };
  expect(file.label).toContain("Training drill. Nobody is missing.");
  await page.goto("/judge");
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  // The end frame of this exact file: a change to the engine or the reader that moves the judged map fails here.
  // Re-exporting the run changes the file and this code in the same commit.
  await expect(section.getByTestId("replay-code")).toHaveText("T43J");
  await expect(section.getByText("Training drill. Nobody is missing.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("replay-refused")).toHaveCount(0);
  // The Numbers section says what is there and promises nothing that is not built.
  const numbers = page.getByRole("region", { name: "Numbers" });
  await expect(numbers).toContainText(`Published run ${file.runId}.`);
  await expect(numbers).not.toContainText("recompute");
});

test("the judge page says what the product is in one line and links home", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByTestId("judge-purpose")).toHaveText("Plans where to search for a missing person, and updates the map as reports come in.");
  const home = page.getByRole("link", { name: "Command post" });
  await expect(home).toHaveAttribute("href", "/");
  // The repository and the video are linked only once they are public.
  await expect(page.getByRole("link", { name: /GitHub|video/i })).toHaveCount(0);
});

// The replay step's target depends on the run file, so each test waits for the file to settle before reading hrefs.
async function routeLinksLand(page: Page): Promise<string[]> {
  const steps = page.getByRole("list", { name: "Three minutes, in order" }).getByRole("link");
  await expect(steps).toHaveText(["Try a practice search", "Watch the drill replay", "Get this laptop ready", "See the cloud model"]);
  const hrefs = await steps.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  for (const href of hrefs) {
    expect(href).toMatch(/^#[a-z0-9-]+$/);
    await expect(page.locator(href)).toHaveCount(1);
  }
  return hrefs;
}

test("the judge page opens with a numbered three-minute route, each step linking to its section", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByRole("region", { name: "Watch the drill replay" })).toBeVisible();
  expect((await routeLinksLand(page))[1]).toBe("#extras-replay-h");
});

test("with no published run the route's replay step goes to the line that says so", { tag: "@no-backend" }, async ({ page }) => {
  await page.route(RUN_URL, (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/judge");
  await expect(page.getByText("No published run yet.")).toBeVisible();
  expect((await routeLinksLand(page))[1]).toBe("#d1-h");
});
