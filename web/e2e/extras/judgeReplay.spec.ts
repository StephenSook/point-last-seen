import { expect, test, type Page } from "@playwright/test";

const harness = "/extras-harness/judge.html";

async function replayPlates(page: Page): Promise<string[]> {
  return (await page.getByRole("region", { name: "Watch the run over time" }).locator(".plate").allTextContents()).sort();
}

async function expectedPlates(page: Page): Promise<string[]> {
  return JSON.parse((await page.getByTestId("expected-code").getAttribute("data-expected-plates"))!) as string[];
}

test("the published run replays on the judge page and its last frame matches the incident's live map", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    // The harness page has no icon of its own; any other error fails the test.
    if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico")) errors.push(`${m.text()} ${m.location().url}`);
  });
  await page.goto(harness);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  const section = page.getByRole("region", { name: "Watch the run over time" });
  await expect(section).toBeVisible();
  const expected = await page.getByTestId("expected-code").textContent();
  expect(expected).toMatch(/^[0-9A-Z]{4}$/);
  await expect(section.getByTestId("replay-code")).toHaveText(expected!);
  // The code hashes the prior version and report ids only; the plates show the map itself.
  await expect(section.locator(".plate").first()).toBeVisible();
  expect(await replayPlates(page)).toEqual(await expectedPlates(page));
  await expect(section.getByRole("slider", { name: "Replay time" })).toBeVisible();
  await expect(section.getByText("Training drill. Nobody is missing.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a run that cannot be replayed shows its reason in plain words", async ({ page }) => {
  await page.goto(`${harness}?run=broken`);
  const section = page.getByRole("region", { name: "Watch the run over time" });
  await expect(section.getByTestId("replay-refused")).toHaveText("This run cannot be replayed. The run has no arrival time for a report.");
  await expect(section.getByRole("slider")).toHaveCount(0);
});

test("with no published run the section is not drawn", async ({ page }) => {
  await page.goto(`${harness}?run=none`);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watch the run over time" })).toHaveCount(0);
});

test("a run with other prior weights keeps the match code but not the map, and the plate check sees it", async ({ page }) => {
  await page.goto(`${harness}?run=weights`);
  const section = page.getByRole("region", { name: "Watch the run over time" });
  await expect(section.getByTestId("replay-code")).toHaveText((await page.getByTestId("expected-code").textContent())!);
  await expect(section.locator(".plate").first()).toBeVisible();
  expect(await replayPlates(page)).not.toEqual(await expectedPlates(page));
});
