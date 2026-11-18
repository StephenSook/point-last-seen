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
