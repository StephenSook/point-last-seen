import { expect, test, type Page } from "@playwright/test";

const harness = "/extras-harness/judge.html";

async function replayPlates(page: Page): Promise<string[]> {
  return (await page.getByRole("region", { name: "Watch the drill replay" }).locator(".plate").allTextContents()).sort();
}

/** Each segment's percent and place as the replay's last frame hands them to the map, and as the live map has them. */
async function frames(page: Page): Promise<{ replay: unknown; live: unknown }> {
  const map = page.getByRole("region", { name: "Watch the drill replay" }).locator(".extras-replay-map");
  const replay = await map.getAttribute("data-frame");
  const live = await page.getByTestId("expected-code").getAttribute("data-expected-frame");
  expect(replay, "the replay publishes its frame").not.toBeNull();
  expect(live, "the harness publishes the live frame").not.toBeNull();
  return { replay: JSON.parse(replay!), live: JSON.parse(live!) };
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
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  await expect(section).toBeVisible();
  const expected = await page.getByTestId("expected-code").textContent();
  expect(expected).toMatch(/^[0-9A-Z]{4}$/);
  await expect(section.getByTestId("replay-code")).toHaveText(expected!);
  // The code hashes the prior version and report ids only; the plates show the map itself.
  await expect(section.locator(".plate:not(.crowded)").first()).toBeVisible();
  expect(await replayPlates(page)).toEqual(await expectedPlates(page));
  // And pair by pair: each segment's percent at that segment's place.
  const f = await frames(page);
  expect(f.replay).toEqual(f.live);
  await expect(section.getByRole("slider", { name: "Replay time" })).toBeVisible();
  // The judge page carries the drill line above its heading, so the replay card does not repeat it.
  await expect(section.getByText("Training drill. Nobody is missing.", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a run that cannot be replayed shows its reason in plain words", async ({ page }) => {
  await page.goto(`${harness}?run=broken`);
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  await expect(section.getByTestId("replay-refused")).toHaveText("This run cannot be replayed. The run has no arrival time for a report.");
  await expect(section.getByRole("slider")).toHaveCount(0);
});

test("with no published run the section is not drawn", async ({ page }) => {
  await page.goto(`${harness}?run=none`);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watch the drill replay" })).toHaveCount(0);
});

test("a run with other prior weights keeps the match code but not the map, and the plate check sees it", async ({ page }) => {
  await page.goto(`${harness}?run=weights`);
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  await expect(section.getByTestId("replay-code")).toHaveText((await page.getByTestId("expected-code").textContent())!);
  await expect(section.locator(".plate:not(.crowded)").first()).toBeVisible();
  expect(await replayPlates(page)).not.toEqual(await expectedPlates(page));
});

test("a run whose shapes trade places keeps the code and the plates' text but not the map, and the pair check sees it", async ({ page }) => {
  await page.goto(`${harness}?run=swap`);
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  await expect(section.getByTestId("replay-code")).toHaveText((await page.getByTestId("expected-code").textContent())!);
  await expect(section.locator(".plate:not(.crowded)").first()).toBeVisible();
  expect(await replayPlates(page)).toEqual(await expectedPlates(page));
  const f = await frames(page);
  expect(f.replay).not.toEqual(f.live);
});

test("the replay card never repeats the drill line, whether or not the run's label carries it", async ({ page }) => {
  const once = async () => {
    const section = page.getByRole("region", { name: "Watch the drill replay" });
    await expect(section.getByTestId("replay-code")).toBeVisible();
    const text = await section.innerText();
    return text.split("Training drill. Nobody is missing.").length - 1;
  };
  await page.goto(`${harness}?run=labelledDrill`);
  expect(await once()).toBe(0);
  await expect(page.getByTestId("run-label")).toHaveText("Development drill, Piedmont Park, Atlanta, 2026-11-18 to 19.");
  await page.goto(`${harness}?run=labelled`);
  expect(await once()).toBe(0);
  await expect(page.getByTestId("run-label")).toHaveText("REAL DRILL, Kennesaw Mountain, 2026-11-22");
});

test("a run with a label of its own shows it under the replay heading; a label that repeats the drill line is not shown twice", async ({ page }) => {
  await page.goto(`${harness}?run=labelled`);
  const section = page.getByRole("region", { name: "Watch the drill replay" });
  await expect(section.getByTestId("run-label")).toHaveText("REAL DRILL, Kennesaw Mountain, 2026-11-22");
  await expect(section.getByText("Training drill. Nobody is missing.", { exact: true })).toHaveCount(0);
  await page.goto(harness);
  await expect(page.getByRole("region", { name: "Watch the drill replay" }).getByTestId("replay-code")).toBeVisible();
  await expect(page.getByTestId("run-label")).toHaveCount(0);
});

