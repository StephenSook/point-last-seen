import { expect, test } from "@playwright/test";

const failed = "This panel could not load. Reconnect, then reload the page.";

test("a print panel that fails to load shows its own message and the command post stays", async ({ page }) => {
  await page.route("**/src/extras/print/PrintSession.tsx*", (route) => route.abort());
  await page.goto("/extras-harness/print.html");
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Print assignment sheet" }).click();
  await expect(page.getByRole("alert").filter({ hasText: failed })).toBeVisible();
  await expect(page.getByText("Made-up harness data")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "More", exact: true })).toBeVisible();
});

test("on the judge page a cube that fails to load leaves the replay in place", async ({ page }) => {
  await page.route("**/src/extras/cube/SpaceTimeCube.tsx*", (route) => route.abort());
  await page.goto("/extras-harness/judge.html");
  await expect(page.getByRole("region", { name: "Space and time" }).getByRole("alert")).toHaveText(failed);
  await expect(page.getByRole("region", { name: "Watch the drill replay" }).getByRole("slider", { name: "Replay time" })).toBeVisible();
});
