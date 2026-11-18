import { expect, test } from "@playwright/test";

const harness = "/extras-harness/judge.html";

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
