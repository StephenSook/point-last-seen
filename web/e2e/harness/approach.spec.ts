import { expect, test } from "@playwright/test";

test("the approach card lists the tracking aids the family named, with the note after them", async ({ page }) => {
  await page.goto(`/harness/approach.html?aids=project_lifesaver,gps_tracker&note=${encodeURIComponent("Tracker is in her coat pocket")}`);
  const aids = page.getByTestId("tracking-aids").getByRole("listitem");
  await expect(aids).toHaveText([
    "Enrolled in Project Lifesaver: ask the county team to bring receivers.",
    "Carries a GPS tracker: ask the family for its last location.",
    "Tracker is in her coat pocket",
  ]);
});

test("an empty list says the family named none, and an absent field shows nothing", async ({ page }) => {
  await page.goto("/harness/approach.html?aids=");
  await expect(page.getByTestId("tracking-aids").getByRole("listitem")).toHaveText(["No tracker or medical ID, as the family said."]);
  await page.goto("/harness/approach.html");
  await expect(page.getByTestId("approach-card")).toBeVisible();
  await expect(page.getByTestId("tracking-aids")).toHaveCount(0);
});
