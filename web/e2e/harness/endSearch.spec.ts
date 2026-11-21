import { expect, test } from "@playwright/test";

test("End this search asks why before anything is written, and Cancel writes nothing", async ({ page }) => {
  await page.goto("/harness/end-search.html");
  await page.getByRole("button", { name: "End this search" }).click();
  const end = page.getByRole("button", { name: "End search", exact: true });
  await expect(end).toBeDisabled();
  await expect(page.getByRole("radio")).toHaveCount(3);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByTestId("ended")).toHaveText("open");
});

test("picking a reason and pressing End search writes that reason once", async ({ page }) => {
  await page.goto("/harness/end-search.html?slow=1");
  await page.getByRole("button", { name: "End this search" }).click();
  await page.getByRole("radio", { name: "Training ended" }).check();
  await page.getByRole("button", { name: "End search", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Ending the search...");
  await expect(page.getByRole("button", { name: "End search", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Server has it" }).click();
  await expect(page.getByTestId("ended")).toHaveText("training_ended");
  // Held until the post shows the search ended, so it cannot be pressed again in between.
  await expect(page.getByRole("button", { name: "End search", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Ending the search...");
});

test("opening the confirm puts the focus on the first reason, and Cancel puts it back on the button", async ({ page }) => {
  await page.goto("/harness/end-search.html");
  await page.getByRole("button", { name: "End this search" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: "Person found" })).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "End this search" })).toBeFocused();
});

test("a refused write says so and keeps the confirm open to try again", async ({ page }) => {
  await page.goto("/harness/end-search.html?fail=1");
  await page.getByRole("button", { name: "End this search" }).click();
  await page.getByRole("radio", { name: "Person found" }).check();
  await page.getByRole("button", { name: "End search", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Could not end the search. Check the connection and try again.");
  await expect(page.getByRole("button", { name: "End search", exact: true })).toBeEnabled();
  await expect(page.getByTestId("ended")).toHaveText("open");
});
