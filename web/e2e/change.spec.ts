import { expect, joinCommand, test, withDebugToken } from "./fixtures";

// What the newest report did, as web/src/command/changeModel.ts words it: a POA change, nothing, a sighting waiting
// for its confirmation, a confirmed sighting that became the new last known point, or a confirmed sighting seen
// before the current last known point, which stays a clue and says so.
const OLDER = " It was not seen after the current last known point, so it counts as a clue\\.";
const BANNER = new RegExp(
  "^(" +
    `.+\\. [A-Z]{2} (\\d+\\.\\d|<0\\.1)% to (\\d+\\.\\d|<0\\.1)%\\.(${OLDER})?` +
    "|Report logged\\. Map unchanged\\. Ask the team\\." +
    "|Sighting saved\\. Confirm it under Sightings to move the map\\." +
    "|New last known point: the sighting (at [A-Z]{2}|outside the mapped area), seen (just before it was confirmed|\\d+ min before it was confirmed)\\. The map is rebuilt from there\\." +
    ")$",
);
const SPOKEN = new RegExp(
  "^(" +
    `Segment [A-Z]{2}\\. POA \\d+\\.\\d percent, (up|down) \\d+\\.\\d, after report: .+\\.(${OLDER})?` +
    "|Report logged\\. Map unchanged\\." +
    "|Sighting saved\\. Confirm it under Sightings to move the map\\." +
    "|New last known point (at segment [A-Z]{2}|outside the mapped area)\\. The map is rebuilt from the sighting\\." +
    ")$",
);

test("the drill post says what its newest report did, on screen and for screen readers", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("change-banner")).toHaveText(BANNER);
  await expect(page.getByTestId("change").getByRole("status")).toHaveText(SPOKEN);
});
