import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The synthetic clip is generated, not committed (the repo keeps every .mp4 out); this needs ffmpeg.
const CLIP = fileURLToPath(new URL("../assets/moving-box.mp4", import.meta.url));
test.beforeAll(() => {
  if (!existsSync(CLIP)) execFileSync("sh", [fileURLToPath(new URL("../assets/make-moving-box.sh", import.meta.url))]);
});

test("the clip form reads only after the three required consents and passes on what was entered", async ({ page }) => {
  await page.goto("/harness/clip.html");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await expect(page.getByTestId("clip-facts")).toHaveText("6 s, 4 KB");
  const read = page.getByRole("button", { name: "Read clip" });
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  await page.getByLabel("The camera's clock is right").check();
  await page.getByRole("radio", { name: "East", exact: true }).check();
  await page.getByRole("combobox", { name: /^Camera at\b/ }).selectOption("AB");
  await page.getByLabel("The person in the clip").check();
  await page.getByLabel("The owner of the footage").check();
  await expect(read).toBeDisabled();
  await page.getByLabel("Cloud reading").check();
  await expect(read).toBeEnabled();
  await read.click();
  await expect(page.getByTestId("asked")).not.toHaveText("");
  const asked = JSON.parse(await page.getByTestId("asked").innerText()) as Record<string, unknown>;
  expect(asked).toMatchObject({
    bytes: 4448, mimeType: "video/mp4", durationS: 6, clockConfirmed: true, cameraFacingDeg: 90,
    consents: { personInClip: true, footageOwner: true, cloudProcessing: true, publicUse: false },
  });
  expect(asked["clipStartMs"]).toBe(await page.evaluate(() => new Date("2026-11-22T14:05:00").getTime()));
  expect((asked["camera"] as { lon: number }).lon).toBeCloseTo(0.003, 9);
  await expect(page.getByRole("status")).toHaveText("Couldn't read this clip. Nothing changed.");
});

test("a clip over 14,000,000 bytes is refused before anything is sent", async ({ page }) => {
  await page.goto("/harness/clip.html");
  await page.getByLabel("Clip", { exact: true }).setInputFiles({ name: "big.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(14_000_001) });
  await expect(page.getByRole("alert")).toHaveText("This clip is larger than 14,000,000 bytes. Trim it and try again.");
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await expect(page.getByRole("button", { name: "Read clip" })).toBeDisabled();
  await expect(page.getByTestId("asked")).toHaveText("");
});

test("a reading shows three facts, and See the frame pauses the clip at the key frame with the box", async ({ page }) => {
  await page.goto("/harness/clip.html?outcome=read");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  await page.getByRole("radio", { name: "East", exact: true }).check();
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  const card = page.getByRole("region", { name: "Camera sighting" });
  await expect(card).toContainText("Last seen 14:05:05");
  await expect(card).toContainText("Heading north");
  await expect(card).toContainText("Blue rain jacket, black bottoms, boots, carrying umbrella");
  await card.getByRole("button", { name: "See the frame" }).click();
  const video = card.locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => (v.readyState >= 2 ? v.currentTime : -1))).toBe(4);
  await expect(card.locator(".clip-box")).toHaveAttribute("style", /top: 40%; left: 30%; height: 20%; width: 40%/);
  await page.screenshot({ path: test.info().outputPath("card.png"), fullPage: true });
});

test("Confirm hands the reading on once and reports the rebuilt prior", async ({ page }) => {
  await page.goto("/harness/clip.html?outcome=read");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  await page.getByRole("radio", { name: "East", exact: true }).check();
  await page.getByRole("combobox", { name: /^Camera at\b/ }).selectOption("AB");
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  await page.getByRole("button", { name: "Confirm sighting" }).click();
  await expect(page.getByRole("status")).toHaveText("Confirmed. Prior rebuilt as v8.");
  await expect(page.getByRole("button", { name: "Confirm sighting" })).toHaveCount(0);
  const confirmed = JSON.parse(await page.getByTestId("confirmed").innerText()) as { sha256: string; bearingDeg: number; camera: { lon: number } };
  expect(confirmed.bearingDeg).toBe(0);
  expect(confirmed.camera.lon).toBeCloseTo(0.003, 9);
});
