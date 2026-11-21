import { execFileSync } from "node:child_process";
import { deployedOnly, expect, test, withDebugToken } from "./fixtures";

const DRILL = "Training drill. Nobody is missing.";

test("the shell loads with the drill line, the join form and no console errors", async ({ page, consoleErrors }) => {
  await withDebugToken(page);
  await page.goto("/");
  await expect(page.getByText(DRILL)).toBeVisible();
  await expect(page.getByLabel("Incident id")).toBeVisible();
  await expect(page.getByLabel("Join code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join as command" })).toBeEnabled();
  await page.waitForLoadState("networkidle");
  expect(consoleErrors).toEqual([]);
});

// Hosting serves an hour of cache when firebase.json sets no header; a judge must get a new deploy at once.
test("the live site revalidates pages, version.json and the service worker, and keeps hashed assets a year", async ({ request }) => {
  deployedOnly();
  for (const path of ["/", "/judge", "/version.json", "/sw.js"]) {
    const res = await request.get(path, { headers: { "Cache-Control": "no-cache" } });
    expect(res.headers()["cache-control"], path).toBe("no-cache");
  }
  const html = await (await request.get("/")).text();
  const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0];
  expect(asset).toBeTruthy();
  expect((await request.get(asset!)).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});

test("the live site serves this commit", async ({ request }) => {
  const want = process.env["EXPECT_COMMIT"] ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const res = await request.get(`/version.json?t=${Date.now()}`);
  expect(res.status()).toBe(200);
  const v = (await res.json()) as { commit: string; dirty: boolean };
  expect(v.commit).toBe(want);
  if (process.env["BASE_URL"]) expect(v.dirty).toBe(false);
});

// Deployed-only: the post loads the drill's photos through Storage, and its console must stay clean.
// It starts from an empty browser (not the run's saved session) so it proves the App Check exchange
// itself; that costs one anonymous sign-up per run.
test.describe("fresh browser", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("a joined command post draws the drill segments and credits the grid as stamped", async ({ page, consoleErrors }) => {
    deployedOnly();
    const incident = process.env["PLS_SMOKE_INCIDENT"];
    const code = process.env["PLS_SMOKE_JOIN_CODE"];
    // Under CI a missing fixture is a failure, never a skip.
    if (!incident || !code) {
      if (process.env["CI"]) throw new Error("PLS_SMOKE_INCIDENT and PLS_SMOKE_JOIN_CODE are required in CI");
      test.skip(true, "needs a seeded drill incident and its join code");
      return;
    }
    await withDebugToken(page);
    const exchange = page.waitForResponse((r) => r.url().includes("exchangeDebugToken") && r.request().method() === "POST");
    await page.goto(`/?incident=${encodeURIComponent(incident)}`);
    await page.getByLabel("Join code").fill(code);
    await page.getByRole("button", { name: "Join as command" }).click();
    expect((await exchange).status()).toBe(200);
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    // The map's workers start after the canvas appears; wait for the map to settle before reading errors.
    await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 20_000 });
    // The drill incident has a grid: its segments must draw, with one printed percent each, and the
    // credit must be the line the grid builder stamped on the incident (no credit only on an empty map).
    await expect(page.locator(".map-empty")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator(".plate:visible").first()).toBeVisible();
    await expect(page.getByTestId("map-credit")).toHaveText("© OpenStreetMap contributors · Protomaps");
    await expect(page.getByText(DRILL)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

// The map's basemap and the walker model's route graph are files the build copies from shared/grid, one pair per
// grid (the dev park and the Kennesaw drill). A missing one is a 404 (not the app shell), and each must come back as
// its own type. Runs against the placeholder build too, so a grid left out of the build fails before a deploy.
for (const grid of ["piedmont-park-dev", "kennesaw-mountain-drill"]) {
  test(`the site serves ${grid}'s basemap tiles and route graph`, { tag: "@no-backend" }, async ({ request }) => {
    const tiles = await request.get(`/tiles/${grid}.pmtiles`, { headers: { range: "bytes=0-15" } });
    expect([200, 206]).toContain(tiles.status());
    expect(tiles.headers()["content-type"] ?? "").not.toContain("text/html");
    expect((await tiles.body()).subarray(0, 7).toString("latin1")).toBe("PMTiles");
    const graph = await request.get(`/tiles/${grid}.graph.json`);
    expect(graph.status()).toBe(200);
    expect(graph.headers()["content-type"] ?? "").toContain("application/json");
    expect(Object.keys((await graph.json()) as object).length).toBeGreaterThan(0);
  });
}
