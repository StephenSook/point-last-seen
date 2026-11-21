import { expect, test } from "@playwright/test";

// The command post's conditions form (web/harness/conditions.html): what command types becomes the incident's
// conditions, and the rail shows the urgency chip the phones show, with its source.
test("command types a cold temperature and sees the chip the phones show, with its source", async ({ page }) => {
  await page.goto("/harness/conditions.html");
  await expect(page.getByText("Not set. The phones show no urgency cue.")).toBeVisible();
  await page.getByLabel("Air temperature (°F)").fill("38");
  await page.getByRole("radio", { name: "No", exact: true }).check();
  await page.getByRole("button", { name: "Save conditions" }).click();
  await expect(page.getByTestId("saved")).toHaveText(/"tempF":38,"wet":false,"setAtMs":\d+/);
  await expect(page.getByTestId("urgency-chip")).toHaveText("Cold raises urgency");
  await expect(page.getByText("A planning cue from a cited source, not a medical judgment.")).toBeVisible();
  await expect(page.getByRole("link", { name: /CDC/ })).toHaveAttribute("href", "https://www.cdc.gov/winter-weather/prevention/index.html");
  await expect(page.getByTestId("conditions-set")).toContainText("38 °F, wet: no");
});

test("cool and wet raises urgency; warm and dry shows no cue", async ({ page }) => {
  await page.goto("/harness/conditions.html");
  await page.getByLabel("Air temperature (°F)").fill("50");
  await page.getByRole("radio", { name: "Yes", exact: true }).check();
  await page.getByRole("button", { name: "Save conditions" }).click();
  await expect(page.getByTestId("urgency-chip")).toHaveText("Cool and wet raises urgency");
  await page.getByLabel("Air temperature (°F)").fill("65");
  await page.getByRole("radio", { name: "No", exact: true }).check();
  await page.getByRole("button", { name: "Save conditions" }).click();
  await expect(page.getByTestId("conditions-set")).toContainText("65 °F, wet: no");
  await expect(page.getByTestId("urgency-chip")).toHaveCount(0);
  await expect(page.getByText("The phones show no urgency cue.")).toBeVisible();
});

test("a temperature outside the rules' range is refused before anything is sent", async ({ page }) => {
  await page.goto("/harness/conditions.html");
  await page.getByLabel("Air temperature (°F)").fill("200");
  await page.getByRole("button", { name: "Save conditions" }).click();
  await expect(page.getByRole("alert")).toHaveText("Type the temperature as a number from -80 to 140.");
  await expect(page.getByTestId("saved")).toHaveText("");
});

test("a refused write says so and keeps what was typed", async ({ page }) => {
  await page.goto("/harness/conditions.html?fail=1");
  await page.getByLabel("Air temperature (°F)").fill("38");
  await page.getByRole("button", { name: "Save conditions" }).click();
  await expect(page.getByRole("alert")).toHaveText("The conditions were not saved. Try again.");
  await expect(page.getByLabel("Air temperature (°F)")).toHaveValue("38");
});

test("conditions already on the incident show with the time they were typed", async ({ page }) => {
  await page.goto("/harness/conditions.html?set=1");
  await expect(page.getByTestId("conditions-set")).toContainText("36 °F, wet: not known");
  await expect(page.getByTestId("conditions-set")).toContainText("Read at");
  await expect(page.getByTestId("urgency-chip")).toHaveText("Cold raises urgency");
  await expect(page.getByLabel("Air temperature (°F)")).toHaveValue("36");
});

test("a closed incident offers no conditions to save", async ({ page }) => {
  await page.goto("/harness/conditions.html?closed=1");
  await expect(page.getByRole("button", { name: "Save conditions" })).toBeDisabled();
});
