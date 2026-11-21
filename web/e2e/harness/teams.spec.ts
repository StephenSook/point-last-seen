import { expect, test } from "@playwright/test";

// The Teams strip: narrow beside the map; picking a team makes it the active one (fg-1, the others fg-4) and outlines
// its assigned cells on the map; picking it again clears it.
const FG1 = "rgb(248, 244, 241)";
const FG2 = "rgb(215, 211, 208)";
const FG4 = "rgb(137, 133, 131)";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/harness/teams.html");
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-state", "idle", { timeout: 15_000 });
});

test("the Teams strip is narrow, and with no team picked every name reads in fg-2", async ({ page }) => {
  const rail = (await page.getByRole("navigation", { name: "Teams" }).boundingBox())!;
  expect(rail.width).toBeLessThanOrEqual(168);
  for (const n of ["Team 1", "Team 2", "Team 3"]) await expect(page.getByRole("button", { name: new RegExp(`^${n}`) })).toHaveCSS("color", FG2);
  await expect(page.getByTestId("map")).toHaveAttribute("data-team-outline", "");
});

test("picking a team makes it fg-1 and the rest fg-4, outlines its cells, and picking it again clears it", async ({ page }) => {
  const t2 = page.getByRole("button", { name: /^Team 2/ });
  await t2.click();
  await expect(t2).toHaveAttribute("aria-pressed", "true");
  await expect(t2).toHaveCSS("color", FG1);
  await expect(page.getByRole("button", { name: /^Team 1/ })).toHaveCSS("color", FG4);
  await expect(page.getByRole("button", { name: /^Team 3/ })).toHaveCSS("color", FG4);
  await expect(page.getByTestId("map")).toHaveAttribute("data-team-outline", "AB AC");
  // The keyboard picks too.
  await page.getByRole("button", { name: /^Team 1/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("map")).toHaveAttribute("data-team-outline", "CD");
  await expect(t2).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: /^Team 1/ }).click();
  await expect(page.getByTestId("map")).toHaveAttribute("data-team-outline", "");
  await expect(t2).toHaveCSS("color", FG2);
});

test("a team with no task can be picked, and outlines nothing", async ({ page }) => {
  await page.getByRole("button", { name: /^Team 3/ }).click();
  await expect(page.getByRole("button", { name: /^Team 3/ })).toHaveCSS("color", FG1);
  await expect(page.getByTestId("map")).toHaveAttribute("data-team-outline", "");
});
