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

test("the live site serves this commit", async ({ request }) => {
  const want = process.env["EXPECT_COMMIT"] ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const res = await request.get(`/version.json?t=${Date.now()}`);
  expect(res.status()).toBe(200);
  const v = (await res.json()) as { commit: string; dirty: boolean };
  expect(v.commit).toBe(want);
  if (process.env["BASE_URL"]) expect(v.dirty).toBe(false);
});

// Deployed-only: the post loads the drill's photos through Storage, and its console must stay clean.
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
  await expect(page.locator(".plate").first()).toBeVisible();
  await expect(page.getByTestId("map-credit")).toHaveText("Map data from OpenStreetMap contributors (ODbL)");
  await expect(page.getByText(DRILL)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
