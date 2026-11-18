import { expect, test } from "@playwright/test";

test("a sighting can be placed and saved from the keyboard alone", async ({ page }) => {
  await page.goto("/harness/sighting.html");
  await page.getByLabel("Seen at").focus();
  const place = page.getByRole("combobox", { name: /^Place\b/ });
  // "Seen at" has its own stops (month, day, year, time); Tab on until Place, as a keyboard user would.
  for (let i = 0; i < 8 && !(await place.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(place).toBeFocused();
  await place.selectOption("AB");
  await expect(page.getByTestId("sighting-place")).toHaveText("Place: segment AB.");
  await page.getByRole("button", { name: "Save sighting" }).press("Enter");
  // AB is row A, column B of the synthetic grid: centre lon 0.003, lat -0.001
  const pos = JSON.parse(await page.getByTestId("saved").innerText()) as { lat: number; lon: number };
  expect(pos.lon).toBeCloseTo(0.003, 9);
  expect(pos.lat).toBeCloseTo(-0.001, 9);
});
