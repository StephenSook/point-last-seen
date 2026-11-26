import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The synthetic clip is generated, not committed (the repo keeps every .mp4 out); this needs ffmpeg.
const CLIP = fileURLToPath(new URL("../assets/moving-box.mp4", import.meta.url));
test.beforeAll(() => {
  if (!existsSync(CLIP)) execFileSync("sh", [fileURLToPath(new URL("../assets/make-moving-box.sh", import.meta.url))]);
});

const list = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Clips read for this search" });

test("a clip read before opens its time machine with its stored track and asks for no new read", async ({ page }) => {
  await page.goto("/harness/stored-clips.html?track=stored");
  const clips = list(page);
  await expect(clips).toContainText("Last seen 14:05:05");
  await expect(clips).toContainText("Blue rain jacket, black bottoms, boots");
  await clips.getByRole("button", { name: "Open the time machine" }).click();
  const tm = page.getByTestId("clip-time-machine");
  await expect(tm.getByRole("region", { name: "Clip time machine" })).toBeVisible({ timeout: 30_000 });
  await tm.getByRole("button", { name: "Clearest frame 0:04" }).click();
  await expect(tm.getByTestId("clip-track-box")).toHaveAttribute("style", /top: 40%; left: 50%; height: 20%; width: 20%/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Track the person" })).toHaveCount(0);
  await expect(page.getByTestId("tracks")).toHaveText("0");
});

test("a clip with no track opens on its clearest frame, and Track the person reads one and says what it sent", async ({ page }) => {
  await page.goto("/harness/stored-clips.html?track=none");
  const clips = list(page);
  await clips.getByRole("button", { name: "Open the time machine" }).click();
  await expect(page.getByTestId("clip-time-machine").locator("video")).toHaveCount(1);
  await page.getByRole("dialog", { name: "Time machine" }).getByRole("button", { name: "Track the person" }).click();
  await expect(page.getByRole("dialog", { name: "Time machine" })).toContainText("6 frames of the clip left this laptop for the cloud. 6 of them were sent again for the outlines.");
  await expect(page.getByTestId("tracks")).toHaveText("1");
  await expect(page.getByRole("button", { name: "Track the person" })).toHaveCount(0);
});

test("a closed search offers no new track read", async ({ page }) => {
  await page.goto("/harness/stored-clips.html?track=none&closed=1");
  const clips = list(page);
  await clips.getByRole("button", { name: "Open the time machine" }).click();
  await expect(page.getByTestId("clip-time-machine").locator("video")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Track the person" })).toHaveCount(0);
});

test("with the time machine off, or no clip read, there is no list", async ({ page }) => {
  await page.goto("/harness/stored-clips.html?track=stored&off=1");
  await expect(page.getByText("Synthetic test clip")).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await page.goto("/harness/stored-clips.html?empty=1");
  await expect(page.getByText("Synthetic test clip")).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});

test("a delete of the search's media closes the open clip", async ({ page }) => {
  await page.goto("/harness/stored-clips.html?track=stored");
  const clips = list(page);
  await clips.getByRole("button", { name: "Open the time machine" }).click();
  await expect(page.getByTestId("clip-time-machine").locator("video")).toHaveCount(1);
  // The delete comes from elsewhere (another seat, or the photo tray) while the panel covers the post.
  await page.getByRole("button", { name: "Media deleted" }).dispatchEvent("click");
  await expect(page.locator("video")).toHaveCount(0);
});
