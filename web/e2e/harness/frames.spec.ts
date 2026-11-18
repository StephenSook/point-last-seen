import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Real decoding in Chrome: a generated moving clip and a still one (both made here with ffmpeg).
const dir = mkdtempSync(join(tmpdir(), "pls-frames-"));
const MOVING = join(dir, "moving.mp4");
const STILL = join(dir, "still.mp4");
test.beforeAll(() => {
  execFileSync("sh", [fileURLToPath(new URL("../assets/make-moving-box.sh", import.meta.url)), MOVING, "100"]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x240:d=6:r=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", STILL]);
});

type Sample = { durationS: number; count: number; size: number; change: number[]; windows: { startS: number; endS: number }[] };
const sample = (page: import("@playwright/test").Page, file: string) =>
  page.evaluate((d) => (window as unknown as { sample: (d: string) => Promise<Sample> }).sample(d), readFileSync(file).toString("base64"));

test.beforeEach(async ({ page }) => {
  await page.goto("/harness/frames.html");
  await expect.poll(() => page.evaluate(() => (window as unknown as { ready?: boolean }).ready === true)).toBe(true);
});

test("a moving clip is sampled every half second at 64 x 36 and gives one moving span", async ({ page }) => {
  const r = await sample(page, MOVING);
  expect([r.durationS, r.count, r.size]).toEqual([6, 12, 64 * 36]);
  expect(Math.min(...r.change)).toBeGreaterThanOrEqual(4);
  expect(r.windows.map((w) => [w.startS, w.endS])).toEqual([[0, 6]]);
});

test("a still clip gives no moving span", async ({ page }) => {
  const r = await sample(page, STILL);
  expect(r.count).toBe(12);
  expect(r.windows).toEqual([]);
});

test("one frame comes out as a JPEG for the laptop's model", async ({ page }) => {
  const b64 = readFileSync(MOVING).toString("base64");
  const head = await page.evaluate((d) => (window as unknown as { jpeg: (d: string, t: number) => Promise<string> }).jpeg(d, 3), b64);
  expect(head).toMatch(/^\/9j\//);
});
