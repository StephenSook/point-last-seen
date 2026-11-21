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
  // The page's own drill line, above the heading, labels the whole page; the replay card does not repeat it.
  await expect(page.getByText("Training drill. Nobody is missing.", { exact: true })).toHaveCount(1);
  await expect(section.getByText("Training drill. Nobody is missing.", { exact: true })).toHaveCount(0);
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
  // The label says what the run holds: test family reports and plans (no searcher reports). README.md says the same.
  expect(file.label).toBe("Development drill, Piedmont Park, Atlanta: test family reports and plans, 2026-11-18 to 19. Training drill. Nobody is missing.");
  await page.goto("/judge");
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  // The end frame of this exact file: a change to the engine or the reader that moves the judged map fails here.
  // Re-exporting the run changes the file and this code in the same commit.
  await expect(section.getByTestId("replay-code")).toHaveText("T43J");
  await expect(section.getByTestId("run-label")).toHaveText("Development drill, Piedmont Park, Atlanta: test family reports and plans, 2026-11-18 to 19.");
  // The page's own drill line, above the heading, labels the whole page; the replay card does not repeat it.
  await expect(page.getByText("Training drill. Nobody is missing.", { exact: true })).toHaveCount(1);
  await expect(section.getByText("Training drill. Nobody is missing.", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("replay-refused")).toHaveCount(0);
  // The Numbers section shows counts read from the served file, each with its unit, and promises nothing not built.
  const numbers = page.getByRole("region", { name: "Numbers" });
  const counted = file as unknown as { events: unknown[]; plans: { version: number }[]; segments: { segmentId: string }[] };
  const events = counted.events.length;
  const versions = new Set(counted.plans.map((p) => p.version)).size;
  const searchSegments = counted.segments.filter((s) => s.segmentId !== "ROW").length;
  await expect(numbers).toContainText(`${events} events, ${versions} plan versions and ${searchSegments} search segments in this run.`);
  await expect(numbers).not.toContainText(file.runId);
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

// The first screen: the door, one line and the practice button, then the replay map at its end as the hero.
for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  test(`at ${width} px the judge page opens with the door, one line and the practice button, then the replay map`, { tag: "@no-backend" }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/judge");
    const h1 = page.getByRole("heading", { level: 1, name: "Judge's door" });
    const lede = page.getByText("No login. About three minutes.", { exact: true });
    const start = page.getByRole("region", { name: "Try a practice search" }).getByRole("button", { name: "Try a practice search" });
    const map = page.getByRole("region", { name: "Watch the drill replay" }).locator(".extras-replay-map");
    await expect(map).toBeVisible();
    const top = async (l: typeof h1) => (await l.boundingBox())!.y;
    const [hY, lY, bY, mY, aY] = [await top(h1), await top(lede), await top(start), await top(map), await top(page.getByTestId("judge-advice"))];
    expect(hY).toBeLessThan(120);
    expect(hY).toBeLessThan(lY);
    expect(lY).toBeLessThan(bY);
    expect(bY).toBeLessThan(mY);
    // The quote sits below the practice card and the replay, not above the door.
    expect(mY).toBeLessThan(aY);
    // The button is on the first screen, and the map starts on it.
    const b = (await start.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(height);
    expect(mY).toBeLessThan(height);
    // No numbered in-page route list any more.
    await expect(page.getByRole("list", { name: "Three minutes, in order" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("with no published run the replay's place under the practice card says so", { tag: "@no-backend" }, async ({ page }) => {
  await page.route(RUN_URL, (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/judge");
  const none = page.getByRole("region", { name: "Replay the training drill" });
  await expect(none.getByText("No published run yet.")).toBeVisible();
  const card = (await page.getByRole("region", { name: "Try a practice search" }).boundingBox())!;
  expect((await none.boundingBox())!.y).toBeGreaterThan(card.y + card.height - 1);
});

test("every link on the judge page is drawn in fg-2 and underlined, never the browser's default blue", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByRole("link", { name: "Command post" })).toBeVisible();
  const r = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--fg-2)";
    document.querySelector("main")!.append(probe);
    const fg2 = getComputedStyle(probe).color;
    probe.remove();
    const links = [...document.querySelectorAll("main a")].map((a) => ({ text: a.textContent, color: getComputedStyle(a).color, line: getComputedStyle(a).textDecorationLine }));
    return { fg2, links };
  });
  expect(r.fg2).toBe("rgb(215, 211, 208)");
  expect(r.links.length).toBeGreaterThanOrEqual(4);
  for (const l of r.links) {
    expect(l.color, l.text ?? "").toBe(r.fg2);
    expect(l.line, l.text ?? "").toContain("underline");
  }
});

test("the judge page never requests a GPS track or a GPX file; at most the passes file beside its run", { tag: "@no-backend" }, async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  // The live page keeps realtime connections open, so the network never goes idle: wait for the passes file itself.
  const passesAnswered = page.waitForResponse((r) => r.url().includes("/extras/passes/"));
  await page.goto("/judge");
  await expect(page.getByRole("region", { name: "Watch the drill replay" }).getByTestId("replay-code")).toBeVisible();
  await passesAnswered;
  expect(urls.filter((u) => /track|\.gpx/i.test(u))).toEqual([]);
  expect(urls.filter((u) => u.includes("/extras/passes/")).map((u) => new URL(u).pathname)).toEqual(["/extras/passes/drill-dev-1-2026-11-19.passes.json"]);
});

test("the Measured block shows the served file's numbers, says where they come from, and refuses an old file", { tag: "@no-backend" }, async ({ page, request }) => {
  const res = await request.get("/evidence/measured.json");
  expect(res.status()).toBe(200);
  const file = (await res.json()) as { reads: { reads: number }; wording: { reads: number }; spend: { days: number } };
  await page.goto("/judge");
  const block = page.getByRole("region", { name: "Measured" });
  await expect(block.getByRole("heading", { name: "Stored on our servers" })).toBeVisible();
  await expect(block).toContainText(`Report reads, `);
  await expect(block).toContainText(`: ${file.reads.reads}.`);
  await expect(block).toContainText(`: ${file.wording.reads} plans.`);
  await expect(block).toContainText(`over ${file.spend.days} days`);
  await expect(block).toContainText("scripts/measured_export.py");
  await expect(block.getByTestId("measured-source")).toContainText("no real search has used the app yet.");
  // A file older than the limit shows no numbers.
  await page.route("**/evidence/measured.json", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ...file, generatedAt: "2020-01-01T00:00:00Z" }) }));
  await page.reload();
  await expect(page.getByTestId("measured-refused")).toHaveText("The measured numbers are more than 30 days old, so none are shown.");
  await expect(page.getByRole("region", { name: "Measured" })).not.toContainText("Report reads");
});

