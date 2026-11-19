import { expect, test } from "@playwright/test";

// Fakes only: nothing is deleted. ?counts=clips,photos and ?answer=ok|denied set what the fakes return.
test("the question names the counts; Delete now gives the server's number, then counts what is left", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=4,3,7&after=0,0,0&answer=ok");
  await expect(page.getByText("Delete 4 clips and 3 photos for this search? This can't be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByRole("status")).toHaveText("The server reports 14 items deleted: clips, photos and their readings.");
  await expect(page.getByText("There are no clips or photos for this search.")).toBeVisible();
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

test("with only saved records left it still offers to delete them", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=0,0,2&answer=ok");
  await expect(page.getByText("Delete 2 saved records for this search's clips and photos? This can't be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByRole("status")).toHaveText("The server reports 2 items deleted: clips, photos and their readings.");
});

test("a lost reply is not called a clean result: it says so and counts again before offering Delete now", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=4,3,7&after=1,0,1&answer=unavailable");
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByRole("status")).toHaveText("The server did not confirm the delete. This shows what is stored now.");
  await expect(page.getByText("Delete 1 clip and 0 photos for this search? This can't be undone.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete now" })).toBeEnabled();
});

test("a reply with no count does not invent one, and shows what is stored now", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=4,3,7&after=0,0,0&answer=nocount");
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByRole("status")).toHaveText("The delete finished, but the server did not say how many items it removed.");
  await expect(page.getByText("There are no clips or photos for this search.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete now" })).toHaveCount(0);
});

test("a count that fails after a lost reply never claims the search is empty", async ({ page }) => {
  await page.goto("/harness/delete.html?counts=4,3,7&answer=unavailable&countfail=after");
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(page.getByRole("alert")).toHaveText("The server did not confirm the delete, and what is stored now could not be counted. Close this and open it again to check.");
  await expect(page.getByText("There are no clips or photos for this search.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete now" })).toHaveCount(0);
});
