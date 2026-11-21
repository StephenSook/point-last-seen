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

/** Line boxes a text node's first `word` occupies: 1 means the word is not broken across lines. */
async function linesOf(page: Page, selector: string, word: string): Promise<number> {
  return page.locator(selector).first().evaluate((el, w) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(w) ?? -1;
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + w.length);
      return new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size;
    }
    return 0;
  }, word);
}

test("at phone width the sheet preview breaks no date or role name in the middle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(harness);
  await openExtra(page, "Print assignment sheet");
  await expect(page.locator("[data-block]").first()).toBeVisible();
  const dateFrom = page.locator('[data-block="2"] dd').first();
  const date = (await dateFrom.textContent()) ?? "";
  expect(date).toMatch(/\d/);
  expect(await linesOf(page, '[data-block="2"] dd', date)).toBe(1);
  expect(await linesOf(page, '[data-block="4"]', "Division/Group")).toBe(1);
  const pageLabel = page.locator(".extras-ics-footer span", { hasText: "IAP Page" }).first();
  expect(await pageLabel.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size;
  })).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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


// The paper debrief: one sheet per segment of the plan (the harness plan gives alfa AA) plus two blank sheets.
test("debrief sheets print one per segment of the plan plus two blank, each on exactly one page", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Print debrief sheets");
  const sheets = page.locator(".extras-debrief-sheet");
  await expect(sheets).toHaveCount(3);
  await expect(sheets.nth(0).locator('[data-field="team"]')).toContainText("Alfa");
  await expect(sheets.nth(0).locator('[data-field="segment"]')).toContainText("AA");
  await expect(sheets.nth(2).locator('[data-field="segment"]')).not.toContainText(/[A-Z]{2}/);
  expect(pdfPages(await page.pdf({ format: "Letter", printBackground: true }))).toBe(3);
});

test("every debrief sheet starts with the drill line, ticks coverage, and asks for no name or phone number", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Print debrief sheets");
  await page.emulateMedia({ media: "print" });
  for (const sheet of await page.locator(".extras-debrief-sheet").all()) {
    expect((await sheet.innerText()).trimStart().startsWith(drillLine)).toBe(true);
    await expect(sheet.locator('[data-field="coverage"] .extras-tick')).toHaveText(["25%", "50%", "75%", "100%"]);
    for (const label of await sheet.locator(".extras-debrief-label").allInnerTexts()) expect(label).not.toMatch(/name|phone/i);
  }
});

test("a filled SAMPLE sheet is added only when its box is ticked, and says SAMPLE on its face", async ({ page }) => {
  await page.goto(harness);
  await openExtra(page, "Print debrief sheets");
  await expect(page.locator(".extras-debrief-sheet")).toHaveCount(3);
  await expect(page.locator('.extras-debrief-sheet[data-sample="true"]')).toHaveCount(0);
  await page.getByLabel("Add a filled SAMPLE sheet for practice").check();
  const sample = page.locator('.extras-debrief-sheet[data-sample="true"]');
  await expect(sample).toHaveCount(1);
  await expect(sample.locator(".extras-debrief-sample-mark")).toHaveText("SAMPLE");
  await expect(sample.locator('[data-field="minutes"]')).toContainText("45");
  await expect(sample.locator('[data-field="coverage"] .extras-tick[data-ticked="true"]')).toHaveText("75%");
  expect(pdfPages(await page.pdf({ format: "Letter", printBackground: true }))).toBe(4);
});

test.describe("in the laptop's own time zone", () => {
  test.use({ timezoneId: "America/New_York" });

  test("the radio cards and the assignment sheet print the same local time, with its zone", async ({ page }) => {
    await page.goto(harness);
    await openExtra(page, "Print assignment sheet");
    const dialog = page.getByRole("dialog", { name: "Print assignment sheet" });
    const dateFrom = await dialog.getByLabel("Date From", { exact: true }).inputValue();
    const timeFrom = await dialog.getByLabel("Time From", { exact: true }).inputValue();
    expect(timeFrom).toMatch(/^\d{2}:\d{2} E[SD]T$/);
    await expect(page.locator(".extras-ics-footer span", { hasText: "Date/Time" }).first()).toHaveText(/E[SD]T$/);
    await page.keyboard.press("Escape");
    await openExtra(page, "Print radio cards");
    const card = page.locator(".extras-radio-card").first();
    await expect(card).toContainText(`${dateFrom} ${timeFrom}`);
    await expect(card).not.toContainText("UTC");
  });

  test("at Letter width in print media, each period date and time, and the prepared time, sits on one line", async ({ page }) => {
    // Lines a field's text takes up on the page.
    const lines = (label: string) => page.evaluate((name) => {
      const field = [...document.querySelectorAll(".extras-ics-sheet .extras-ics-fields > div")].find((d) => d.querySelector("dt")?.textContent === name);
      const range = document.createRange();
      range.selectNodeContents(field!.querySelector("dd")!);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    }, label);
    // Letter is 8.5 in and the page margin 0.4 in a side: the sheet lays out in 7.7 in, 739 px at 96 per inch.
    await page.setViewportSize({ width: 739, height: 960 });
    await page.goto(harness);
    await openExtra(page, "Print assignment sheet");
    const dialog = page.getByRole("dialog", { name: "Print assignment sheet" });
    await dialog.getByLabel("Date To", { exact: true }).fill("11/22/2026");
    await dialog.getByLabel("Time To", { exact: true }).fill("23:59 EST");
    await page.emulateMedia({ media: "print" });
    for (const label of ["Date From", "Date To", "Time From", "Time To"]) expect(await lines(label), label).toBe(1);
    const footer = await page.locator(".extras-ics-footer span", { hasText: "Date/Time" }).first().evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    });
    expect(footer).toBe(1);
    // The check can fail: a time far too long for the box takes more than one line.
    await page.emulateMedia({ media: "screen" });
    await dialog.getByLabel("Time To", { exact: true }).fill("23:59 Eastern Standard Time, then the next shift");
    await page.emulateMedia({ media: "print" });
    expect(await lines("Time To")).toBeGreaterThan(1);
  });
});
