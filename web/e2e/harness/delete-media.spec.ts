import { expect, test } from "@playwright/test";

// Fakes only: nothing is deleted. ?counts=clips,photos and ?answer=ok|denied set what the fakes return.
test("the question names the counts; Delete now shows what the server removed", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=4,3&answer=ok");
  await expect(page.getByText("Delete 4 clips and 3 photos for this search? This can't be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByRole("status")).toHaveText("Deleted 14 items: clips, photos and their readings.");
  await expect(page.getByRole("button", { name: "Delete now" })).toHaveCount(0);
  await expect(page.getByTestId("runs")).toHaveText("1");
});

test("Cancel deletes nothing", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=4,3&answer=ok");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("runs")).toHaveText("0");
});

test("a refusal shows the server's reason in plain words", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=1,0&answer=denied");
  await expect(page.getByText("Delete 1 clip and 0 photos for this search? This can't be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByRole("alert")).toHaveText("Only the incident's command can delete its media.");
});

test("with nothing stored it says so and offers no delete", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=0,0&answer=ok");
  await expect(page.getByText("There are no clips or photos for this search.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete now" })).toHaveCount(0);
});
