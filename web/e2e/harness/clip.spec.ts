import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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
  // The full words: the press stores the clip with the search before Gemini reads it.
  await page.getByLabel("Cloud reading (the clip is stored with this search for up to 30 days and read by Gemini)", { exact: true }).check();
  await expect(read).toBeEnabled();
  await read.click();
  await expect(page.getByTestId("asked")).not.toHaveText("");
  const asked = JSON.parse(await page.getByTestId("asked").innerText()) as Record<string, unknown>;
  expect(asked).toMatchObject({
    // The clip is encoded on the machine running the test, and its size depends on that ffmpeg build.
    bytes: statSync(CLIP).size, mimeType: "video/mp4", durationS: 6, clockConfirmed: true, cameraFacingDeg: 90,
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
  await expect(page.getByRole("status")).toHaveText("No person found on this device. Nothing was sent.");
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

test("triage: when the flagged seconds give no usable reading, the whole clip can be read with the same consents", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=flagged");
  // A miss and an unusable reply look the same here, so it never claims no one was there.
  await expect(page.getByRole("status")).toHaveText("No usable reading from the flagged seconds. Nothing changed.");
  expect(await how(page)).toEqual({ window: { startS: 1, endS: 5 }, reason: "on_device_triage_flagged" });
  await page.getByRole("button", { name: "Read the whole clip in the cloud" }).click();
  // A retry: it uses the first read's consent record and writes no new one.
  await expect.poll(() => how(page)).toEqual({ reason: "user_override_after_triage", retry: true });
});

test("triage: changing a consent withdraws the whole-clip read", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=flagged");
  await expect(page.getByRole("button", { name: "Read the whole clip in the cloud" })).toBeVisible();
  await page.getByLabel("Public use").check();
  await expect(page.getByRole("button", { name: "Read the whole clip in the cloud" })).toHaveCount(0);
});

test("after a flagged window's cloud read, reading the same clip again goes out as a retry", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=flagged");
  await expect(page.getByRole("button", { name: "Read the whole clip in the cloud" })).toBeVisible();
  await page.getByRole("button", { name: "Read clip" }).click();
  await expect.poll(() => how(page)).toEqual({ window: { startS: 1, endS: 5 }, reason: "on_device_triage_flagged", retry: true });
});

test("a delete of the search's media unticks every consent, so a new read needs fresh ticks", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=flagged");
  await page.getByRole("button", { name: "Media deleted" }).click();
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await expect(page.getByLabel(c)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Read the whole clip in the cloud" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read clip" })).toBeDisabled();
});

test("after a delete and fresh ticks, the next read is a new read, not a retry", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=flagged");
  await page.getByRole("button", { name: "Media deleted" }).click();
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  // The second read must have happened before its options are checked: the first read's options are the same.
  await expect(page.getByTestId("calls")).toHaveText("2");
  expect(await how(page)).toEqual({ window: { startS: 1, endS: 5 }, reason: "on_device_triage_flagged" });
});

test("a delete while the clip file is still loading stops the read: nothing reaches the model", async ({ page }) => {
  await page.addInitScript(() => {
    const load = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function held(this: File) {
      return new Promise<ArrayBuffer>((resolve) => {
        (window as unknown as { releaseFile: () => void }).releaseFile = () => void load.call(this).then(resolve);
      });
    };
  });
  await fillAndRead(page, "/harness/clip.html");
  await page.getByRole("button", { name: "Media deleted" }).click();
  await page.evaluate(() => (window as unknown as { releaseFile: () => void }).releaseFile());
  await expect(page.getByRole("button", { name: "Read clip" })).toBeDisabled();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("asked")).toHaveText("");
});

test("a delete while triage runs stops the read: nothing reaches the model", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?triage=flagged&slowtriage=1");
  await page.getByRole("button", { name: "Media deleted" }).click();
  await page.getByRole("button", { name: "Triage finishes" }).click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("asked")).toHaveText("");
  await expect(page.getByRole("button", { name: "Read the whole clip in the cloud" })).toHaveCount(0);
});

test("a read that failed before any consent record existed is not followed by a retry", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=failed-early");
  await expect(page.getByTestId("calls")).toHaveText("1");
  await page.getByRole("button", { name: "Read clip" }).click();
  await expect(page.getByTestId("calls")).toHaveText("2");
  expect(await how(page)).toEqual({});
});

test("a read that failed after its consent record was written is followed by a retry", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=failed-late");
  await expect(page.getByTestId("calls")).toHaveText("1");
  await page.getByRole("button", { name: "Read clip" }).click();
  await expect(page.getByTestId("calls")).toHaveText("2");
  expect(await how(page)).toEqual({ retry: true });
});

test("a clip reading carries a closed What ran receipt with the bytes of the clip sent", async ({ page }) => {
  await page.goto("/harness/clip.html?outcome=read");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  await page.getByRole("radio", { name: "East", exact: true }).check();
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  const card = page.getByRole("region", { name: "Camera sighting" });
  const receipt = card.getByRole("group").filter({ has: page.getByText("What ran", { exact: true }) });
  await receipt.getByText("What ran", { exact: true }).click();
  await expect(receipt).toContainText("Asked for: the cloud, with the clip's three consents.");
  await expect(receipt).toContainText("Ran: in the cloud (reported by the SDK).");
  await expect(receipt).toContainText("Model: gemini-3.5-flash-lite.");
  await expect(receipt).toContainText("Sent: 5,000 bytes of the clip, as base64.");
  await expect(receipt).toContainText("Stored: the clip, with this search, until command deletes it or for 30 days.");
});

test("a confirm that turned the elevation layer off says why where command confirmed", async ({ page }) => {
  await page.goto("/harness/clip.html?outcome=read&note=1");
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  await page.getByRole("radio", { name: "East", exact: true }).check();
  await page.getByRole("combobox", { name: /^Camera at\b/ }).selectOption("AB");
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  await page.getByRole("button", { name: "Confirm sighting" }).click();
  await expect(page.getByRole("status")).toHaveText("Confirmed. Prior rebuilt as v8. Rebuilt without downhill and level ground: the new start is outside the mapped segments.");
});


test("after a read, the receipt counts the track's frames and the time machine opens with the box on its clock", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await card.getByText("What ran", { exact: true }).click();
  await expect(card).toContainText("6 frames of the clip left this laptop for the cloud. 6 of them were sent again for the outlines.");
  await card.getByRole("button", { name: "Open the time machine" }).click();
  const tm = page.getByTestId("clip-time-machine");
  await expect(tm.getByRole("region", { name: "Clip time machine" })).toBeVisible({ timeout: 30_000 });
  await tm.getByRole("button", { name: "Clearest frame 0:04" }).click();
  const video = tm.locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.currentTime * 10) / 10), { timeout: 10_000 }).toBe(4);
  // At 4 s the fixed track's box spans x 500 to 700 and y 400 to 600 of 1000.
  await expect(tm.getByTestId("clip-track-box")).toHaveAttribute("style", /top: 40%; left: 50%; height: 20%; width: 20%/);
  await page.screenshot({ path: test.info().outputPath("time-machine.png"), fullPage: true });
});

test("a track that could not be read says so, and the time machine still opens on the clearest frame", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=fail");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await expect(card.getByRole("status")).toHaveText("The person's track could not be read. The time machine shows the clearest frame.");
  await card.getByRole("button", { name: "Open the time machine" }).click();
  const tm = page.getByTestId("clip-time-machine");
  await expect(tm.getByRole("region", { name: "Clip time machine" })).toBeVisible({ timeout: 30_000 });
  await tm.getByRole("button", { name: "Clearest frame 0:04" }).click();
  await expect(tm.getByTestId("clip-track-box")).toHaveAttribute("style", /top: 40%; left: 30%; height: 20%; width: 40%/, { timeout: 10_000 });
});

test("with the time machine off there is no time machine button", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read");
  await expect(page.getByRole("region", { name: "Camera sighting" }).getByRole("button", { name: "Open the time machine" })).toHaveCount(0);
});

test("when the 3D view cannot load, the time machine says so and keeps the clip with its box", async ({ page }) => {
  await page.route(/\/extras\/timemachine\/TimeMachine\.tsx/, (route) => route.abort());
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await card.getByRole("button", { name: "Open the time machine" }).click();
  const tm = page.getByTestId("clip-time-machine");
  await expect(tm.getByRole("status")).toHaveText("The 3D view could not load. The clip and the person's box are still shown here.", { timeout: 30_000 });
  await expect(tm.locator("video")).toHaveCount(1);
  // The panel around the card is still there, not torn down by the failed import.
  await expect(page.getByRole("button", { name: "Confirm sighting" })).toBeVisible();
});

test("a delete while the track is read clears the card, and the late track neither brings it back nor counts as current", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=slow");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await expect(card.getByText("Tracking the person in the clip.")).toBeVisible();
  await page.getByRole("button", { name: "Media deleted" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("This search's clips and photos were deleted. Give the consents again to read a clip.")).toBeVisible();
  await page.getByRole("button", { name: "Track finishes" }).click();
  await expect(page.getByTestId("track-current")).toHaveText("false");
  await expect(card).toHaveCount(0);
});

test("a delete while the time machine is open closes it and the clip with it", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await card.getByRole("button", { name: "Open the time machine" }).click();
  await expect(page.getByTestId("clip-time-machine").locator("video")).toHaveCount(1);
  // The delete comes from elsewhere (another seat, or the photo tray) while the panel covers the post.
  await page.getByRole("button", { name: "Media deleted" }).dispatchEvent("click");
  await expect(page.getByTestId("clip-time-machine")).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
});

test("turning the time machine off while the sighting is read starts no track read", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1&slowread=1");
  await page.getByRole("button", { name: "Turn the time machine off" }).click();
  await page.getByRole("button", { name: "Read finishes" }).click();
  await expect(page.getByRole("region", { name: "Camera sighting" })).toBeVisible();
  await expect(page.getByTestId("track-calls")).toHaveText("0");
  await expect(page.getByRole("button", { name: "Open the time machine" })).toHaveCount(0);
});

test("a track read that fails after frames left still says what was sent", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=failsent");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await expect(card.getByRole("status")).toHaveText("The person's track could not be read. The time machine shows the clearest frame.");
  await card.getByText("What ran", { exact: true }).click();
  await expect(card).toContainText("6 frames of the clip left this laptop for the cloud.");
});

test("a sighting read before says only the sighting was not sent again, and the track read's frames are still counted", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=cached&track=1");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await expect(card).toContainText("The sighting was read before; the clip was not sent again for it.");
  await card.getByText("What ran", { exact: true }).click();
  await expect(card).toContainText("Sent for the sighting: nothing now; it came from an earlier read of the same clip.");
  await expect(card).toContainText("6 frames of the clip left this laptop for the cloud. 6 of them were sent again for the outlines.");
  await expect(card).not.toContainText("Read before, not sent again.");
});

test("when the 3D view cannot load, the result buttons still move the clip and its box", async ({ page }) => {
  await page.route(/\/extras\/timemachine\/TimeMachine\.tsx/, (route) => route.abort());
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await card.getByRole("button", { name: "Open the time machine" }).click();
  const tm = page.getByTestId("clip-time-machine");
  await expect(tm.getByRole("status")).toHaveText("The 3D view could not load. The clip and the person's box are still shown here.", { timeout: 30_000 });
  await tm.getByRole("button", { name: "Clearest frame 0:04" }).click();
  await expect.poll(() => tm.locator("video").evaluate((v: HTMLVideoElement) => Math.round(v.currentTime * 10) / 10), { timeout: 10_000 }).toBe(4);
  await expect(tm.getByTestId("clip-track-box")).toHaveAttribute("style", /top: 40%; left: 50%; height: 20%; width: 20%/);
});

test("a seek with the clip's own controls while paused moves the box with it", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await card.getByRole("button", { name: "Open the time machine" }).click();
  const video = page.getByTestId("clip-time-machine").locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await video.evaluate((v: HTMLVideoElement) => {
    v.pause();
    v.currentTime = 2;
  });
  // At 2 s the fixed track's box spans x 300 to 500 and y 400 to 600 of 1000.
  await expect(page.getByTestId("clip-track-box")).toHaveAttribute("style", /top: 40%; left: 30%; height: 20%; width: 20%/, { timeout: 10_000 });
});

test("a 3D view that breaks while running says so, keeps the clip, and reports the error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/\/extras\/timemachine\/TimeMachine\.tsx/, (route) =>
    route.fulfill({ contentType: "application/javascript", body: 'export default function TimeMachine() { throw new Error("the view broke"); }' }),
  );
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
  const card = page.getByRole("region", { name: "Camera sighting" });
  await card.getByRole("button", { name: "Open the time machine" }).click();
  const tm = page.getByTestId("clip-time-machine");
  await expect(tm.getByRole("status")).toHaveText("The 3D view stopped working. The clip and the person's box are still shown here.", { timeout: 30_000 });
  await expect(tm.locator("video")).toHaveCount(1);
  await expect.poll(() => errors.some((m) => m.includes("the view broke"))).toBe(true);
});

test("a Confirm refused after a delete does not show on the next clip's card", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&ack=slowfail");
  await page.getByRole("button", { name: "Confirm sighting" }).click();
  await page.getByRole("button", { name: "Media deleted" }).click();
  await page.getByRole("button", { name: "Ack fails" }).click();
  // The form after a delete starts empty: the clip is picked again and the consents given again.
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  await expect(page.getByRole("region", { name: "Camera sighting" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm sighting" })).toBeVisible();
});

test.describe("the open time machine is a wide panel over the post", () => {
  test("at 1440 wide the clip and a 3D block of at least 560 px sit side by side, and Close returns to the card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
    const open = page.getByRole("region", { name: "Camera sighting" }).getByRole("button", { name: "Open the time machine" });
    await open.click();
    const panel = page.getByRole("dialog", { name: "Time machine" });
    await expect(panel.getByRole("region", { name: "Clip time machine" })).toBeVisible({ timeout: 30_000 });
    const video = (await panel.locator("video").boundingBox())!;
    const stage = (await panel.locator(".tm-stage").boundingBox())!;
    expect(stage.width).toBeGreaterThanOrEqual(560);
    expect(video.width).toBeGreaterThanOrEqual(480);
    expect(video.x + video.width).toBeLessThanOrEqual(stage.x + 1);
    await expect(panel.getByRole("button", { name: "Clearest frame 0:04" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("time-machine-1440.png") });
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test("on a phone it stacks with no sideways scroll, and Escape closes it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
    await page.getByRole("region", { name: "Camera sighting" }).getByRole("button", { name: "Open the time machine" }).click();
    const panel = page.getByRole("dialog", { name: "Time machine" });
    await expect(panel.getByRole("region", { name: "Clip time machine" })).toBeVisible({ timeout: 30_000 });
    const video = (await panel.locator("video").boundingBox())!;
    const stage = (await panel.locator(".tm-stage").boundingBox())!;
    expect(video.x).toBeGreaterThanOrEqual(0);
    expect(video.x + video.width).toBeLessThanOrEqual(390);
    expect(stage.y).toBeGreaterThanOrEqual(video.y + video.height - 1);
    expect(await panel.evaluate((p) => p.scrollWidth <= p.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("time-machine-390.png") });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("the person's box is kept out of the player's own controls", async ({ page }) => {
    await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
    await page.getByRole("region", { name: "Camera sighting" }).getByRole("button", { name: "Open the time machine" }).click();
    const layer = page.getByTestId("clip-time-machine").locator(".clip-box-layer");
    await expect(layer).toHaveCount(1);
    const style = await layer.evaluate((l) => ({ clip: getComputedStyle(l).clipPath, events: getComputedStyle(l).pointerEvents }));
    expect(style.clip).toContain("44px");
    expect(style.events).toBe("none");
  });
});

test("a 3D view that could not load is tried again on the next open", async ({ page }) => {
  let blocked = 0;
  await page.route(/\/extras\/timemachine\/TimeMachine\.tsx/, (route) => (blocked++ === 0 ? route.abort() : route.continue()));
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=1");
  const open = page.getByRole("region", { name: "Camera sighting" }).getByRole("button", { name: "Open the time machine" });
  await open.click();
  const panel = page.getByRole("dialog", { name: "Time machine" });
  await expect(panel.getByRole("status")).toHaveText("The 3D view could not load. The clip and the person's box are still shown here.", { timeout: 30_000 });
  await panel.getByRole("button", { name: "Close" }).click();
  await open.click();
  await expect(page.getByRole("dialog", { name: "Time machine" }).getByRole("region", { name: "Clip time machine" })).toBeVisible({ timeout: 30_000 });
});

test("a track read stopped by a delete still says what had left", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=slowsent");
  await page.getByRole("button", { name: "Media deleted" }).click();
  await page.getByRole("button", { name: "Track finishes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "were deleted" })).toContainText("The clip's track read stopped. 6 frames of the clip left this laptop for the cloud.");
});

test("a track read stopped by Discard still says what had left, after the panel closed", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=slowsent");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByRole("region", { name: "Camera sighting" })).toHaveCount(0);
  await page.getByRole("button", { name: "Track finishes" }).click();
  await expect(page.getByTestId("stopped")).toHaveText("The clip's track read stopped. 6 frames of the clip left this laptop for the cloud.");
});

test("a track that could not be saved says so on the card", async ({ page }) => {
  await fillAndRead(page, "/harness/clip.html?outcome=read&track=savefail");
  await expect(page.getByRole("region", { name: "Camera sighting" }).getByText("The track was not saved, so another seat will read its own.")).toBeVisible();
});
