import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// Writes one approved plan to the drill incident per run (it reaches the server on reconnect).
test("with the link down, Approve shows the plan at once and sends it when the link returns", async ({ page, context }) => {
  test.setTimeout(120_000);
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  try {
    await page.getByRole("button", { name: "Suggest plan" }).click();
    await expect(page.getByTestId("suggested-plan")).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByTestId("plan-status")).toHaveText(/^Approved on this laptop as plan v\d+\. Sending\.$/, { timeout: 3_000 });
    await expect(page.getByRole("button", { name: "Suggest plan" })).toBeEnabled();
  } finally {
    await context.setOffline(false);
  }
  await expect(page.getByTestId("plan-status")).toHaveText(/^Approved as plan v\d+\. Sent\.$/, { timeout: 40_000 });
});
