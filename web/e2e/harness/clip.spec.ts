import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

async function fillAndRead(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
}
const how = async (page: import("@playwright/test").Page) => JSON.parse((await page.getByTestId("how").innerText()) || "null") as unknown;

test("triage: no person on this laptop sends nothing, and Read in the cloud anyway records why", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=no-person");
  await expect(page.getByRole("status")).toHaveText("No person found on this laptop. Nothing was sent.");
  await expect(page.getByTestId("asked")).toHaveText("");
  await page.getByRole("button", { name: "Read in the cloud anyway" }).click();
  await expect(page.getByTestId("asked")).not.toHaveText("");
  expect(await how(page)).toEqual({ reason: "user_override_after_triage" });
});

test("triage: a still clip sends nothing", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=no-motion");
  await expect(page.getByRole("status")).toHaveText("Nothing moves in this clip. Nothing was sent.");
  await expect(page.getByTestId("asked")).toHaveText("");
  await expect(page.getByRole("button", { name: "Read in the cloud anyway" })).toBeVisible();
});

test("triage: a flagged clip is read only for its flagged seconds", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=flagged");
  await expect(page.getByTestId("asked")).not.toHaveText("");
  expect(await how(page)).toEqual({ window: { startS: 1, endS: 5 }, reason: "on_device_triage_flagged" });
});

test("triage: without this laptop's model the clip goes to the plain consented read", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=no-model");
  await expect(page.getByTestId("asked")).not.toHaveText("");
  expect(await how(page)).toEqual({});
});

test("the card's band says when the person is in view, and a click opens the clip at that second", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await expect(card.getByTestId("clip-band")).toContainText("Person in view 00:01 to 00:05");
  const band = card.getByRole("button", { name: "Show the frame at 00:01" });
  const box = (await band.boundingBox())!;
  await band.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const video = card.locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => (v.readyState >= 2 ? v.currentTime : -1))).toBe(3);
  await expect(card.locator(".clip-box")).toHaveCount(0);
  await band.press("Enter");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => (v.readyState >= 2 ? v.currentTime : -1))).toBe(1);
});

test("choosing another clip clears every consent, so consent never carries over to a different file", async ({ page }) => {
  await page.goto("/harness/clip.html");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading", "Public use"]) await page.getByLabel(c).check();
  await page.getByLabel("Clip", { exact: true }).setInputFiles({ name: "other.mp4", mimeType: "video/mp4", buffer: Buffer.concat([readFileSync(CLIP), Buffer.from([0])]) });
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading", "Public use"]) await expect(page.getByLabel(c)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Read clip" })).toBeDisabled();
});

test("unchecking a consent while triage holds the clip withdraws Read in the cloud anyway", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=no-person");
  await expect(page.getByRole("button", { name: "Read in the cloud anyway" })).toBeVisible();
  await page.getByLabel("Cloud reading").uncheck();
  await expect(page.getByRole("button", { name: "Read in the cloud anyway" })).toHaveCount(0);
  await expect(page.getByTestId("asked")).toHaveText("");
});

test("from the moment Read clip is pressed, consent and the file are locked until the read ends", async ({ page }) => {
  // Slow the file read, so the time between the press and the read is long enough to act in.
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function slow(this: File) {
      return new Promise((resolve) => setTimeout(() => resolve(original.call(this)), 1500));
    };
  });
  await page.goto("/harness/clip.html");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  await expect(page.getByLabel("Cloud reading")).toBeDisabled({ timeout: 300 });
  await expect(page.getByLabel("Clip", { exact: true })).toBeDisabled();
  await expect(page.getByTestId("asked")).not.toHaveText("", { timeout: 5_000 });
  expect(JSON.parse(await page.getByTestId("asked").innerText()).consents.cloudProcessing).toBe(true);
});

test("a clip that cannot be read from this computer says so and unlocks the form", async ({ page }) => {
  await page.addInitScript(() => {
    File.prototype.arrayBuffer = function fail() {
      return Promise.reject(new DOMException("The file could not be read.", "NotReadableError"));
    };
  });
  await page.goto("/harness/clip.html");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  await expect(page.getByRole("alert")).toHaveText("This clip could not be read from this computer. Choose it again.");
  await expect(page.getByLabel("Clip", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await expect(page.getByTestId("asked")).toHaveText("");
});
