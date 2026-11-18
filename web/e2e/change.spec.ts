import { expect, joinCommand, test, withDebugToken } from "./fixtures";

test("the drill post says what its newest report did, on screen and for screen readers", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate").first()).toBeVisible({ timeout: 20_000 });
  const banner = page.getByTestId("change-banner");
  await expect(banner).toHaveText(/^(.+\. [A-Z]{2} \d+% to \d+%\.|Report logged\. Map unchanged\. Ask the team\.)$/);
  await expect(page.getByTestId("change").getByRole("status")).toHaveText(/^(Segment [A-Z]{2}\. POA \d+ percent, (up|down) \d+, after report: .+\.|Report logged\. Map unchanged\.)$/);
});
