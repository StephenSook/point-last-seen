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

test("the clock and the elapsed time are each labelled, shown once, and the elapsed digits are not in the 7-segment font", async ({ page }) => {
  const dialog = await openReplay(page);
  await expect(dialog.locator(".extras-replay-facts")).toContainText(/Clock \d\d:\d\d/);
  const readout = dialog.locator(".extras-ruler-clock");
  await expect(readout).toHaveText(/^Elapsed \d\d:\d\d:\d\d$/);
  const font = await readout.locator(".extras-ruler-elapsed").evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).not.toContain("DSEG7");
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
  await expect(dialog.locator(".extras-replay-facts")).toContainText("reports arrived");
  await expect(dialog.getByTestId("replay-route")).toHaveCount(0);
  await expect(dialog.getByText("Route not reported")).toHaveCount(0);
});

test("the slider works by keyboard and announces the time", async ({ page }) => {
  const dialog = await openReplay(page);
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", /^\d\d:\d\d, 0 minutes in$/);
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /^\d\d:\d\d, 1 minute in$/);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /^\d\d:\d\d, 2 minutes in$/);
  // Period jumps to the next mark: the first report arrives 3 minutes in.
  await page.keyboard.press(".");
  await expect(slider).toHaveAttribute("aria-valuetext", /^\d\d:\d\d, 3 minutes in$/);
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
  await expect(slider).toHaveAttribute("aria-valuetext", /, 3 minutes in$/);
});

test("without reduced motion Play runs the replay to the end", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const dialog = await openReplay(page);
  const slider = dialog.getByRole("slider", { name: "Replay time" });
  const end = await slider.getAttribute("max");
  await dialog.getByRole("button", { name: "Play" }).click();
  await expect(dialog.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(slider).toHaveValue(end!, { timeout: 40_000 });
  await expect(dialog.getByRole("button", { name: "Play" })).toBeVisible();
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

