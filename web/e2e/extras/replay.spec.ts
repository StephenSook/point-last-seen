import { expect, test, type Page } from "@playwright/test";

const harness = "/extras-harness/replay.html";

async function openReplay(page: Page) {
  await page.goto(harness);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Replay" }).click();
  const dialog = page.getByRole("dialog", { name: "Replay" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("dragging the slider to the end shows the same match code as the live header", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    // The harness page has no icon of its own; any other error fails the test.
    if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico")) errors.push(`${m.text()} ${m.location().url}`);
  });
  const dialog = await openReplay(page);
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(dialog.getByTestId("replay-not-stored")).toBeVisible();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const live = await page.getByTestId("live-code").textContent();
  expect(live).toMatch(/^[0-9A-Z]{4}$/);
  await expect(dialog.getByTestId("replay-code")).toHaveText(live!);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "More", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test("one clock: the bubble over the slider head says the time since the start and the report, as the slider announces", async ({ page }) => {
  const dialog = await openReplay(page);
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  const bubble = dialog.locator(".extras-ruler-bubble");
  await expect(bubble).toHaveText(/^\d+ min, report 6 of 6$/);
  await expect(bubble).toHaveText((await slider.getAttribute("aria-valuetext"))!);
  // No second clock anywhere in the replay: no "Clock" line, no "Elapsed" readout, no hh:mm:ss digits.
  await expect(dialog.locator(".extras-replay-facts")).not.toContainText("Clock");
  await expect(dialog.getByText("Elapsed")).toHaveCount(0);
  await expect(dialog.locator(".extras-replay")).not.toContainText(/\d\d:\d\d:\d\d/);
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(bubble).toHaveText("0 min, report 0 of 6");
});

test("the facts line says how the latest report was read, and by which model", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialog = await openReplay(page);
  const route = dialog.getByTestId("replay-route");
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(route).toHaveCount(0);
  await dialog.getByRole("button", { name: "Next report" }).click();
  await expect(route).toHaveText("Last report: Read on the laptop, model chrome-built-in");
  await slider.focus();
  await page.keyboard.press("End");
  await expect(route).toHaveText("Last report: Read in the cloud, model gemini-3.5-flash-lite");
  await expect(dialog.locator(".extras-replay-facts")).toContainText("Last report: Read in the cloud");
});

test("a run with no route on any report shows no route line at any time", async ({ page }) => {
  await page.goto(`${harness}?routes=none`);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Replay" }).click();
  const dialog = page.getByRole("dialog", { name: "Replay" });
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(dialog.getByTestId("replay-code")).toBeVisible();
  await expect(dialog.getByTestId("replay-route")).toHaveCount(0);
  await expect(dialog.getByText("Route not reported")).toHaveCount(0);
});

test("the segments the latest report changed are outlined on the map and counted in words", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialog = await openReplay(page);
  const map = dialog.locator(".extras-replay-map");
  const changed = dialog.getByTestId("replay-changed");
  // At the end: the last clue moved AB and AA by a point or more.
  await expect(changed).toHaveText("2 segments changed, outlined");
  await expect(map).toHaveAttribute("data-outlined", "AA AB");
  // One report back: the confirmation of the sighting in BB.
  await dialog.getByRole("button", { name: "Previous report" }).click();
  await dialog.getByRole("button", { name: "Previous report" }).click();
  await expect(map).toHaveAttribute("data-outlined", "AA BB");
  // At the start no map is stored, so nothing is outlined.
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(changed).toHaveCount(0);
  await expect(map).toHaveAttribute("data-outlined", "");
});

for (const width of [1280, 390]) {
  test(`at ${width} px the scrubber sits right under the map, with Play at its left`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const dialog = await openReplay(page);
    const map = (await dialog.locator(".extras-replay-map").boundingBox())!;
    const bar = (await dialog.locator(".extras-scrubber").boundingBox())!;
    const play = (await dialog.locator(".extras-scrubber").getByRole("button", { name: "Play" }).boundingBox())!;
    const track = (await dialog.locator(".extras-ruler-track").boundingBox())!;
    expect(Math.abs(bar.y - (map.y + map.height))).toBeLessThanOrEqual(1);
    expect(play.x + play.width).toBeLessThanOrEqual(track.x);
    // One row: Play sits beside the track, not above it.
    expect(play.y).toBeGreaterThanOrEqual(bar.y);
    expect(play.y + play.height).toBeLessThanOrEqual(bar.y + bar.height);
    expect(track.y).toBeLessThan(play.y + play.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("the span with no stored map is shaded on the scrubber and says so", async ({ page }) => {
  const dialog = await openReplay(page);
  const band = dialog.locator(".extras-ruler-unstored");
  await expect(band).toHaveCount(1);
  const b = (await band.boundingBox())!;
  const t = (await dialog.locator(".extras-ruler-track svg").boundingBox())!;
  // The harness window runs 15 minutes from its first send; the current prior came into use 5 minutes in.
  expect(b.x).toBeCloseTo(t.x, 0);
  expect(b.width / t.width).toBeCloseTo(5 / 15, 1);
  await expect(dialog.locator(".extras-ruler-unstored-label")).toHaveText("No stored map");
});

test("the slider works by keyboard and announces the time", async ({ page }) => {
  const dialog = await openReplay(page);
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "0 min, report 0 of 6");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "1 min, report 0 of 6");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "2 min, report 0 of 6");
  // Period jumps to the next mark: the first report arrives 3 minutes in.
  await page.keyboard.press(".");
  await expect(slider).toHaveAttribute("aria-valuetext", "3 min, report 1 of 6");
});

test("with reduced motion there is no Play button and Next report moves the slider", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialog = await openReplay(page);
  await expect(dialog.getByRole("button", { name: "Play" })).toHaveCount(0);
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("Home");
  const before = Number(await slider.inputValue());
  await dialog.getByRole("button", { name: "Next report" }).click();
  const after = Number(await slider.inputValue());
  expect(after).toBeGreaterThan(before);
  await expect(slider).toHaveAttribute("aria-valuetext", "3 min, report 1 of 6");
});

test("Play starts on the first stored map, holds about 1.5 s per report and ends on the live map", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const dialog = await openReplay(page);
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  const end = await slider.getAttribute("max");
  // Record whether the no-map line ever shows while playing.
  await page.evaluate(() => {
    const w = window as unknown as { sawNotStored: boolean };
    w.sawNotStored = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="replay-not-stored"]')) w.sawNotStored = true;
    }).observe(document.body, { subtree: true, childList: true });
  });
  const started = Date.now();
  await dialog.getByRole("button", { name: "Play" }).click();
  await expect(dialog.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(dialog.getByTestId("replay-code")).toBeVisible();
  // The harness's prior came into use 5 minutes in; four reports arrive after it, so Play holds on five frames.
  await expect(dialog.getByRole("button", { name: "Play" })).toBeVisible({ timeout: 15_000 });
  const took = Date.now() - started;
  expect(took).toBeGreaterThan(4_500);
  expect(took).toBeLessThan(9_000);
  await expect(slider).toHaveValue(end!);
  expect(await page.evaluate(() => (window as unknown as { sawNotStored: boolean }).sawNotStored)).toBe(false);
  await expect(dialog.getByTestId("replay-code")).toHaveText((await page.getByTestId("live-code").textContent())!);
});

test("the before-prior span shows the not-stored line and no percent plate", async ({ page }) => {
  const dialog = await openReplay(page);
  await expect(dialog.locator(".plate:not(.crowded)").first()).toBeVisible();
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(dialog.getByTestId("replay-not-stored")).toHaveText("Earlier prior. The map for this time is not stored.");
  await expect(dialog.getByTestId("replay-code")).toHaveCount(0);
  await expect(dialog.locator(".plate")).toHaveCount(0);
});

test("the order line is labelled as an order, not a track, with its leg in words", async ({ page }) => {
  const dialog = await openReplay(page);
  await expect(dialog.getByText("Order of confirmed sightings. Not a track.")).toBeVisible();
  await expect(dialog.locator(".extras-replay-legs li")).toHaveText([/^\d+ m in 9 min, \d\.\d\d m\/s$/]);
});

test("a report still sending is named, and the end frame says why it differs from the live map", async ({ page }) => {
  await page.goto(`${harness}?pending=1`);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Replay" }).click();
  const dialog = page.getByRole("dialog", { name: "Replay" });
  await expect(dialog.getByText("1 report is still sending and is not in the replay.")).toBeVisible();
  // The live header counts the pending rejection; the replay cannot, and says so.
  await expect(dialog.getByTestId("replay-code")).not.toHaveText((await page.getByTestId("live-code").textContent())!);
});

test("with no report yet, the replay says so in a compact dialog", async ({ page }) => {
  await page.goto(`${harness}?reports=none`);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Replay" }).click();
  const dialog = page.getByRole("dialog", { name: "Replay" });
  await expect(dialog.getByText("No report has arrived yet, so there is nothing to replay.")).toBeVisible();
  // Nothing stretches to fill the screen: the heading and the Close button keep their own height.
  const heading = await dialog.getByRole("heading", { name: "Replay" }).boundingBox();
  const close = await dialog.getByRole("button", { name: "Close" }).boundingBox();
  expect(heading!.height).toBeLessThan(60);
  expect(close!.height).toBeLessThan(60);
  expect(close!.width).toBeGreaterThan(close!.height);
});

