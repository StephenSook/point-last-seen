import { expect, test, type Page } from "@playwright/test";

const harness = "/extras-harness/print.html";
const drillLine = "Training drill. Nobody is missing.";

async function openExtra(page: Page, name: string) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name }).click();
}

test("the sheet shows nine numbered blocks", async ({ page }) => {
  await page.goto(harness);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await openExtra(page, "Print assignment sheet");
  await expect(page.locator("[data-block]")).toHaveCount(9);
  for (let block = 1; block <= 9; block++) {
    await expect(page.locator(`[data-block="${block}"]`)).toBeVisible();
  }
});

test("the sheet's match code line counts reports, not every event", async ({ page }) => {
  // The harness has 14 sightings, a confirmation and a retraction of one sighting: 13 reports, 16 events.
  await page.goto(harness);
  await openExtra(page, "Print assignment sheet");
  await expect(page.getByText(/Map match code at print time: .* \(plan v\d+, 13 reports\)\./).first()).toBeVisible();
});

/** Pages in a PDF, counted from its page objects. */
function pdfPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

// teams11long: eleven teams whose task text is long enough to wrap, the worst case a sheet must still fit.
const sheetCases = [["kennesaw", "?site=kennesaw", 1], ["teams11", "?teams=11", 3], ["teams11long", "?teams=11&long=1", 3]] as const;
for (const [site, query, sheets] of sheetCases) {
  test(`each assignment sheet prints on exactly one page (${site}: ${sheets} sheet${sheets === 1 ? "" : "s"})`, async ({ page }) => {
    await page.goto(`${harness}${query}`);
    await openExtra(page, "Print assignment sheet");
    await expect(page.locator("[data-block]").first()).toBeVisible();
    await expect(page.locator(".extras-ics-sheet")).toHaveCount(sheets);
    expect(pdfPages(await page.pdf({ format: "Letter", printBackground: true }))).toBe(sheets);
  });
}

test("in print media the whole page is white, so no dark margin prints around the sheet", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Print assignment sheet");
  // The sheet loads on first use; the page is in its printing state once the sheet is there.
  await expect(page.locator("[data-block]").first()).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const white = "rgb(255, 255, 255)";
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(white);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(white);
});

test("in print media the command post is hidden and the sheet is visible", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Print assignment sheet");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  const sheet = page.locator(".extras-ics-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Oak Park");
  await expect(sheet).not.toContainText(/private-marker|joinCode|profile\/command/);
});

test("the drill line is on every printed page", async ({ page }) => {
  await page.goto(`${harness}?teams=11`);
  await openExtra(page, "Print assignment sheet");
  await page.emulateMedia({ media: "print" });
  const sheets = page.locator(".extras-ics-sheet");
  await expect(sheets).toHaveCount(3);
  for (const [index, sheet] of (await sheets.all()).entries()) {
    await expect(sheet).toContainText(drillLine);
    await expect(sheet).toContainText(`${index + 1} of 3`);
  }
});

test("the print view is usable by keyboard", async ({ page }) => {
  await page.goto(harness);
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.focus();
  await page.keyboard.press("Enter");
  // "Replay" is the first item; the arrow keys move down the menu.
  await expect(page.getByRole("menuitem", { name: "Replay" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Print assignment sheet" })).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Print assignment sheet" });
  await expect(dialog).toBeVisible();
  for (const label of ["Date From", "Date To", "Time From", "Time To", "Branch", "Division", "Group", "Staging Area", "Print the person's names and approach notes (teams need them in the field; paper leaves this app)"]) {
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel(label, { exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Print", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(more).toBeFocused();
});

test("typing k7-q4 against K7Q4 shows Same map", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Check a radio code");
  const dialog = page.getByRole("dialog", { name: "Check a radio code" });
  await dialog.getByLabel("Code heard on the radio").fill("k7-q4");
  await expect(dialog.getByRole("status")).toHaveText("Same map.");
});

test("typing a different code shows the count line", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Check a radio code");
  const dialog = page.getByRole("dialog", { name: "Check a radio code" });
  const field = dialog.getByLabel("Code heard on the radio");
  await field.fill("K7Q5");
  await expect(dialog.getByRole("status")).toHaveText("Different map. Ask the team how many reports they have. Command has 13.");
  await field.fill("KU7Q");
  await expect(dialog.getByRole("status")).toHaveText("A match code has 4 characters. Letters I, L, O and U are never used.");
});

test("two cards fit one letter page in print media", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Print radio cards");
  await page.emulateMedia({ media: "print" });
  const sheet = page.locator(".extras-radio-sheet");
  await expect(sheet).toHaveCount(1);
  const cards = sheet.locator(".extras-radio-card");
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card).toContainText(drillLine);
    await expect(card).toContainText("Kilo Seven Quebec Four");
    expect((await card.boundingBox())?.height).toBeLessThanOrEqual(5 * 96);
  }
  expect((await sheet.boundingBox())?.height).toBeLessThanOrEqual(10 * 96);
});

const personBox = "Print the person's names and approach notes (teams need them in the field; paper leaves this app)";
const namesLine = "Answers to Roberta (also Bea, Mom, Miss Bea)";
const stopLine = "If they may not come when called, stop calling their name.";

test("the sheet prints the person's names above the stop-calling note only when the plain-worded box is ticked", async ({ page }) => {
  await page.goto(`${harness}?profile=1`);
  await openExtra(page, "Print assignment sheet");
  const box = page.getByRole("checkbox", { name: personBox });
  await expect(box).not.toBeChecked();
  const block7 = page.locator('[data-block="7"]').first();
  await expect(block7).not.toContainText("Answers to");
  await box.check();
  const text = (await block7.textContent()) ?? "";
  expect(text).toContain(namesLine);
  expect(text.indexOf(namesLine)).toBeLessThan(text.indexOf(stopLine));
  expect(text).not.toMatch(/seizure/i);
  await expect(block7).toContainText("Training drill. Nobody is missing.");
});

test("each radio card prints the person's names only when the same box is ticked, and keeps its training line", async ({ page }) => {
  await page.goto(`${harness}?profile=1`);
  await openExtra(page, "Print radio cards");
  const box = page.getByRole("checkbox", { name: personBox });
  await expect(box).not.toBeChecked();
  const cards = page.locator(".extras-radio-card");
  await expect(cards.first()).toBeVisible();
  await expect(page.locator(".extras-radio-sheet")).not.toContainText("Answers to");
  await box.check();
  for (const card of await cards.all()) {
    await expect(card).toContainText(namesLine);
    await expect(card).toContainText(stopLine);
    await expect(card).toContainText("Training drill. Nobody is missing.");
  }
});

