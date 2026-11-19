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
  const section = page.getByRole("region", { name: "Watch the run over time" });
  await expect(section.getByTestId("replay-code")).toHaveText(/^[0-9A-Z]{4}$/);
  await expect(section.locator(".plate").first()).toBeVisible();
  await expect(section.getByRole("slider", { name: "Replay time" })).toBeVisible();
  await expect(section.getByText("Training drill. Nobody is missing.")).toBeVisible();
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
