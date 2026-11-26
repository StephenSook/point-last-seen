import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type {} from "../../extras-harness/timemachineHarness";

const harness = "/extras-harness/timemachine.html";
const frameS = 1 / 30;
const fixture = new URL("../../extras-harness/fixtures/moving-box.mp4", import.meta.url);

test.beforeAll(() => {
  if (!existsSync(fixture)) {
    const makeClip = fileURLToPath(new URL("make-moving-box.sh", fixture));
    execFileSync("sh", [makeClip]);
  }
});

async function expectThumbnails(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__tm.thumbnailCount), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(15);
}

async function expectVideoAt(page: Page, timeS: number) {
  await expect.poll(() => page.evaluate((timeS) => {
    const { video } = window.__tm;
    return video.seeking || video.readyState < 2 ? Infinity : Math.abs(video.currentTime - timeS);
  }, timeS)).toBeLessThanOrEqual(frameS);
}

test("the block fills, the slider seeks, and the last result moves the clock", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => { errors.push(error.message); });

  await page.goto(harness);
  await expect(page.getByRole("heading", { name: "Made-up harness data" })).toBeVisible();
  const view = page.getByRole("region", { name: "Clip time machine" });
  const canvas = view.locator("canvas");
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => window.__tm.segmentCount)).toBe(1);
  await expectThumbnails(page);
  await expect(view.getByRole("button", { name: "First seen 0:00", exact: true })).toBeVisible();
  await expect(view.getByRole("button", { name: "Clearest frame 0:04", exact: true })).toBeVisible();

  const slider = view.getByRole("slider", { name: "Clip time" });
  await expect(slider).toBeVisible();
  // Playwright fill only supports text inputs. Fill the native range and send its input event.
  await slider.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, "4");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__tm.clock.now().timeS)).toBeCloseTo(4, 9);
  await expectVideoAt(page, 4);
  const screenshot = testInfo.outputPath("timemachine-at-4s.png");
  await canvas.screenshot({ path: screenshot });
  await testInfo.attach("Time machine at 4 seconds", { path: screenshot, contentType: "image/png" });

  await view.getByRole("button", { name: "Last seen 0:08", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__tm.clock.now())).toEqual({ timeS: 8, source: "scene" });
  await expectVideoAt(page, 8);
  expect(errors).toEqual([]);
});

test("dragging the frame card moves the clock and seeks the video", async ({ page }) => {
  await page.goto(harness);
  await expect(page.locator("canvas")).toBeVisible();
  await expectThumbnails(page);
  await page.getByRole("button", { name: "Clearest frame 0:04", exact: true }).click();
  await expectVideoAt(page, 4);
  await expect(page.locator(".tm-clock")).toHaveText("00:04");

  // The card is near the centre of the block at 4 seconds. Later slices are to its right.
  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw new Error("Missing time machine canvas");
  const x = canvas.x + canvas.width / 2;
  const y = canvas.y + canvas.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + canvas.height / 8, y, { steps: 10 });
  await page.mouse.up();

  const timeS = await page.evaluate(() => window.__tm.clock.now().timeS);
  expect(timeS).toBeGreaterThan(4);
  await expectVideoAt(page, timeS);
});

test("the block shows a card and slices without a track", async ({ page }) => {
  await page.goto(`${harness}?track=none`);
  await expect(page.getByRole("img", { name: "3D clip view. Person at centre at 0:04." })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expectThumbnails(page);
  await page.getByRole("button", { name: "Clearest frame 0:04", exact: true }).click();
  await expect(page.locator(".tm-clock")).toBeVisible();
  await expect(page.locator(".tm-clock")).toHaveText("00:04");
  await expectVideoAt(page, 4);
});

test("the time machine harness has no WCAG A or AA violation", async ({ page }) => {
  await page.goto(harness);
  await expect(page.locator("canvas")).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
});

test("the filled block runs at 30 fps or more during clip playback", async ({ page }, testInfo) => {
  await page.goto(harness);
  await expect(page.locator("canvas")).toBeVisible();
  await expectThumbnails(page);
  const sample = await page.evaluate(async () => {
    await window.__tm.video.play();
    return new Promise<{ frames: number; elapsedMs: number; fps: number }>((resolve) => {
      requestAnimationFrame((start) => {
        let frames = 0;
        function count(now: number) {
          frames += 1;
          const elapsedMs = now - start;
          if (elapsedMs < 3_000) requestAnimationFrame(count);
          else resolve({ frames, elapsedMs, fps: frames * 1_000 / elapsedMs });
        }
        requestAnimationFrame(count);
      });
    });
  });
  await testInfo.attach("Time machine frame rate", { body: JSON.stringify(sample), contentType: "application/json" });
  // 30 fps on real hardware (this Mac, and ci-local's run of the same Chromium). GitHub's shared runners draw WebGL
  // without a GPU: one run there measured 26.5 fps (2026-11-26, web.yml run 45779829138) with no change to this code,
  // so on Actions the check is a sanity floor of 20 fps, which still fails a stalled or frozen loop (a few fps or none).
  const floor = process.env["GITHUB_ACTIONS"] === "true" ? 20 : 30;
  expect(sample.fps).toBeGreaterThanOrEqual(floor);
});
