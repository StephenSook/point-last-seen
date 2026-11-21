import { AUTH_STATE } from "./authState";
import { expect, joinCommand, mapDrawn, openDetails, test, withDebugToken } from "./fixtures";

// Writes one command-entered sighting to the drill incident per run (the normal product path).
test("a new report plays the beat once on the live post, and a reload does not replay it", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const wrap = page.getByTestId("map").locator("xpath=..");
  await expect(wrap).not.toHaveAttribute("data-beat", /.+/); // nothing plays on load
  await page.getByRole("button", { name: "Add sighting" }).click();
  await page.getByRole("combobox", { name: /^Place\b/ }).selectOption({ index: 1 });
  await page.getByLabel(/^Note/).fill("Drill check: seen near the first segment. Training drill inject.");
  await page.getByRole("button", { name: "Save sighting" }).click();
  await expect(wrap).toHaveAttribute("data-beat", "playing", { timeout: 10_000 });
  await expect(wrap).toHaveAttribute("data-beat", "done", { timeout: 2_500 });
  await expect(page.getByTestId("change-banner")).toHaveText(/\.$/);
  await page.reload();
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("map").locator("xpath=..")).not.toHaveAttribute("data-beat", /.+/);
});

// The checks below also write reports to the test drill. They live in this file so they run one after another
// with the beat check above (tests in one file share a worker), and never land a report during its beat.
// Each saves its report while the browser is offline, so the write waits in the browser (Firestore keeps it in
// IndexedDB) until the link is back.

// A unique marker in letters only: a run of seven or more digits (a timestamp, say) is a phone number to the
// note's scrubber and would be removed before the note is stored, so a check could never find it again.
const marker = () => Date.now().toString().replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]!);
const note = (what: string) => `Drill check: ${what} ${marker()}. Training drill inject.`;

async function addSighting(page: import("@playwright/test").Page, text: string): Promise<void> {
  await page.getByRole("button", { name: "Add sighting" }).click();
  await page.getByRole("combobox", { name: /^Place\b/ }).selectOption({ index: 1 });
  await page.getByLabel(/^Note/).fill(text);
  await page.getByRole("button", { name: "Save sighting" }).click();
}

test("online, a report the server has not answered yet says it is saving, asks before the page closes, and clears once sent", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".seg-code:visible").first()).toBeVisible({ timeout: 20_000 });
  // The link is up but Firestore's writes cannot get through, so the report stays unanswered.
  await page.route("**/google.firestore.v1.Firestore/Write/**", (route) => route.abort());
  await addSighting(page, note("saved online, writes held back"));
  const saving = page.getByTestId("saving");
  await expect(saving).toHaveText("Saving one report. Keep this page open.");
  const asked = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
  await page.unrouteAll();
  await expect(saving).toHaveCount(0, { timeout: 60_000 });
});

test("offline, a report stored in this browser says so and lets the page close without asking", async ({ page, context }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".seg-code:visible").first()).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await addSighting(page, note("saved offline, page closed without asking"));
  await expect(page.getByTestId("saving")).toHaveText("Saved in this browser. It sends when you're back online.");
  let asked = false;
  page.on("dialog", (d) => {
    asked = true;
    void d.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(asked).toBe(false);
});

test("a report saved offline in a page that then closed reaches the server when the post is opened again", async ({ page, context, browser }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".seg-code:visible").first()).toBeVisible({ timeout: 20_000 });
  const text = note("saved offline, page closed");
  await context.setOffline(true);
  await addSighting(page, text);
  // The post says so once Firestore has stored the report in this browser; closing then is safe.
  await expect(page.getByTestId("saving")).toHaveText("Saved in this browser. It sends when you're back online.");
  await page.close({ runBeforeUnload: false });

  // The same browser opens the post again with the link back: Firestore sends the queued report from its
  // stored queue (the post's own list of pending writes starts empty, so it is not the evidence here).
  await context.setOffline(false);
  const again = await context.newPage();
  await withDebugToken(again);
  await joinCommand(again);

  // A separate browser, with none of this one's stored writes, reads the report from the server.
  const other = await browser.newContext({ storageState: AUTH_STATE });
  const fresh = await other.newPage();
  await withDebugToken(fresh);
  await joinCommand(fresh);
  await expect(fresh.getByText(`"${text}"`)).toBeVisible({ timeout: 30_000 });
  await other.close();
});

// Command takes a report back: the report stays in Reports, struck through, and leaves the Sightings list. Written
// online after the checks above, in this file so it never lands during the beat check.
test("command retracts a report from Reports: it stays, struck through, survives a reload and leaves Sightings", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await mapDrawn(page);
  const text = note("retracted by command");
  await addSighting(page, text);
  await expect(page.getByTestId("saving")).toHaveCount(0, { timeout: 60_000 });
  // It is listed under Sightings first, so leaving it below means something. The test drill keeps undecided test
  // sightings, some seen later than now, so this one need not be among the three shown: show them all first.
  const sightings = page.getByRole("region", { name: "Sightings" });
  const showAll = sightings.getByRole("button", { name: /^Show all/ });
  if (await showAll.count()) await showAll.click();
  await expect(sightings.getByText(text)).toHaveCount(1);
  await openDetails(page);
  const report = page.getByRole("region", { name: "Reports" }).getByRole("listitem").filter({ hasText: text });
  await report.getByRole("button", { name: "Retract" }).click();
  await report.getByRole("button", { name: "Retract report" }).click();
  await expect(report).toContainText("Retracted by command.");
  await expect(page.getByRole("region", { name: "Sightings" }).getByText(text)).toHaveCount(0);
  await expect(page.getByTestId("saving")).toHaveCount(0, { timeout: 60_000 });
  await page.reload();
  await mapDrawn(page);
  await openDetails(page);
  await expect(page.getByRole("region", { name: "Reports" }).getByRole("listitem").filter({ hasText: text })).toContainText("Retracted by command.");
});

