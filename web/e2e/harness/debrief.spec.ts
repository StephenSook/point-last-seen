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
  await row.getByLabel("Time it took (minutes)").fill("35");
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect.poll(() => saved(page)).toEqual({ segmentId: "AB", input: { tookMinutes: 35, worked: "Line search along the creek", didNotWork: "Radio dead zone" }, existing: true, clearedEventId: "b".repeat(32) });
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
