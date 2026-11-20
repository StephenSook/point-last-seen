import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// Read-only: the drill post shows its channel to the family. It never asks a question or changes the search
// state, because both send a push to the family's devices.
test("the drill post shows the family channel with the search state and the question templates", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  const family = page.getByRole("region", { name: "Family", exact: true });
  await expect(family).toBeVisible({ timeout: 20_000 });
  await expect(family.getByRole("group", { name: "Search state for the family" }).getByRole("button", { name: "Searching" })).toBeVisible();
  await expect(family.getByRole("button", { name: "Paused" })).toBeVisible();
  await expect(family.getByText("Did they ever go by another name?")).toBeVisible();
});
