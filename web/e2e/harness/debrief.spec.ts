import { expect, test } from "@playwright/test";

const saved = async (page: import("@playwright/test").Page) => JSON.parse((await page.getByTestId("saved").innerText()) || "null") as unknown;

test("each cleared segment shows its debrief, or offers to add one", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  const s = page.getByRole("region", { name: "Debriefs" });
  await expect(s.getByTestId("debrief-AA")).toContainText("No debrief yet.");
  await expect(s.getByTestId("debrief-AB")).toContainText("30 min");
  await expect(s.getByTestId("debrief-AB")).toContainText("Worked: Line search along the creek");
  await expect(s.getByTestId("debrief-AB")).toContainText("Didn't work: Radio dead zone");
  await expect(s.getByTestId("debrief-AB")).toContainText("By Team 2");
  await expect(s.getByTestId("debrief-AB")).toContainText("Coverage stated by the team: 50%");
  await expect(s.getByTestId("debrief-AB")).toContainText("Clues: Wrapper by the footbridge");
  await expect(s.getByTestId("debrief-AB")).toContainText("Hazards: Fast water at the ford");
});

test("command adds a debrief for a cleared segment, tied to its clear", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Add debrief" }).click();
  await row.getByLabel("Time it took (minutes)").fill("45");
  await row.getByLabel("What worked (optional)").fill("Dogs found the trail");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect.poll(() => saved(page)).toEqual({ segmentId: "AA", input: { tookMinutes: 45, worked: "Dogs found the trail" }, existing: false, clearedEventId: "a".repeat(32) });
});

test("a time that is not whole minutes from 0 to 1440 is refused with the reason, and nothing is saved", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Add debrief" }).click();
  await row.getByLabel("Time it took (minutes)").fill("2000");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect(row.getByRole("alert")).toHaveText("Time it took: a whole number of minutes, 0 to 1440.");
  await expect(page.getByTestId("saved")).toHaveText("");
});

test("editing a debrief starts from what is stored and saves it as an edit", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  const row = page.getByTestId("debrief-AB");
  await row.getByRole("button", { name: "Edit debrief" }).click();
  await expect(row.getByLabel("Time it took (minutes)")).toHaveValue("30");
  await expect(row.getByLabel("Coverage the team stated (percent, optional)")).toHaveValue("50");
  await row.getByLabel("Time it took (minutes)").fill("35");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect.poll(() => saved(page)).toEqual({
    segmentId: "AB",
    input: { tookMinutes: 35, worked: "Line search along the creek", didNotWork: "Radio dead zone", coverageStatedPct: 50, clues: "Wrapper by the footbridge", hazards: "Fast water at the ford" },
    existing: true,
    clearedEventId: "b".repeat(32),
  });
});

test("a refused save says so and keeps the form open", async ({ page }) => {
  await page.goto("/harness/debrief.html?save=fail");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Add debrief" }).click();
  await row.getByLabel("Time it took (minutes)").fill("10");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect(row.getByRole("alert")).toHaveText("The debrief was not saved. Try again.");
  await expect(row.getByLabel("Time it took (minutes)")).toHaveValue("10");
});

test("command records the coverage the team stated, and its clues and hazards, and the row shows them", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Add debrief" }).click();
  await row.getByLabel("Time it took (minutes)").fill("45");
  await row.getByLabel("Coverage the team stated (percent, optional)").fill("75");
  await row.getByLabel("Clues: what and where (optional)").fill("Blue scarf on trail marker 4");
  await row.getByLabel("Hazards: what and where (optional)").fill("Loose rock by the overlook");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect.poll(() => saved(page)).toEqual({
    segmentId: "AA",
    input: { tookMinutes: 45, coverageStatedPct: 75, clues: "Blue scarf on trail marker 4", hazards: "Loose rock by the overlook" },
    existing: false,
    clearedEventId: "a".repeat(32),
  });
});

test("a stated coverage over 100 is refused with the reason, and nothing is saved", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Add debrief" }).click();
  await row.getByLabel("Time it took (minutes)").fill("45");
  await row.getByLabel("Coverage the team stated (percent, optional)").fill("101");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect(row.getByRole("alert")).toHaveText("Coverage stated: a whole number from 0 to 100, or empty.");
  await expect(page.getByTestId("saved")).toHaveText("");
});

test("a phone number typed in a note is replaced in what is stored and in the row that shows it", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Add debrief" }).click();
  await row.getByLabel("Time it took (minutes)").fill("45");
  await row.getByLabel("Clues: what and where (optional)").fill("Call 404 555 0142 at the gate");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect.poll(() => saved(page)).toMatchObject({ input: { tookMinutes: 45, clues: "Call [number removed] at the gate" } });
  await expect(row).toContainText("Clues: Call [number removed] at the gate");
  await expect(row).not.toContainText("0142");
});

test("opening a segment's debrief from the sighting form opens its form as Add would, with the cursor in What worked, and saves nothing", async ({ page }) => {
  await page.goto("/harness/debrief.html?open=AA");
  const row = page.getByTestId("debrief-AA");
  await expect(row.getByLabel("What worked (optional)")).toBeFocused();
  await expect(row.getByLabel("What worked (optional)")).toHaveValue("");
  await expect(page.getByTestId("saved")).toHaveText("");
});

test("opening a debrief already being edited keeps the edits, and opening one with a stored debrief shows its words", async ({ page }) => {
  await page.goto("/harness/debrief.html?open=AB");
  const row = page.getByTestId("debrief-AB");
  await expect(row.getByLabel("What worked (optional)")).toHaveValue("Line search along the creek");
  await row.getByLabel("Time it took (minutes)").fill("45");
  await page.getByRole("button", { name: "Ask to open" }).click();
  await expect(row.getByLabel("What worked (optional)")).toBeFocused();
  await expect(row.getByLabel("Time it took (minutes)")).toHaveValue("45");
});

test("opening a debrief while its paper sheet is open leaves the sheet as it is", async ({ page }) => {
  await page.goto("/harness/debrief.html?paper=sample");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  const cancel = row.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await page.getByRole("button", { name: "Ask to open" }).click();
  await expect(cancel).toBeVisible();
  await expect(row.getByLabel("What worked (optional)")).toHaveCount(0);
});

test("a debrief saved from another screen while this form is open is never overwritten by this form's save", async ({ page }) => {
  await page.goto("/harness/debrief.html?open=AA");
  const row = page.getByTestId("debrief-AA");
  await row.getByLabel("Time it took (minutes)").fill("30");
  await page.getByRole("button", { name: "Another screen saves" }).click();
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect(row.getByRole("alert")).toHaveText("This debrief was saved from another screen while you edited. Cancel and open it again to see it.");
  await expect(page.getByTestId("saved")).toHaveText("");
});

test("a debrief open request already handled does not open the row again when it leaves and comes back", async ({ page }) => {
  await page.goto("/harness/debrief.html?open=AA");
  const row = page.getByTestId("debrief-AA");
  await expect(row.getByLabel("What worked (optional)")).toBeFocused();
  await row.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Take back AA's clear" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Clear AA again" }).click();
  await expect(row.getByRole("button", { name: "Add debrief" })).toBeVisible();
  // The row reopened a moment after it drew; wait past that before checking that it did not.
  await page.waitForTimeout(500);
  await expect(row.getByLabel("What worked (optional)")).toHaveCount(0);
});
