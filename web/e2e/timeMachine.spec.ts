import AxeBuilder from "@axe-core/playwright";
import { expect, test, withDebugToken } from "./fixtures";

// The deployed time machine in a judge's practice search: the copied practice clip (only the blurred copy of the
// team's porch clip) opens with its stored track, its box on the clock, a smooth view and no model call at all.
// It starts a real practice search, one of the judges' 50 a day: tagged @quota, it runs only with PLS_ALLOW_QUOTA=1.
const PRACTICE_CLIP = "28fffd2082fd48ea50709b94c8d37b823d2613dc5997adffda1117136483ddfb";
const AI_HOST = /firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("a practice search opens the practice clip's time machine with its stored track and no model call", { tag: "@quota" }, async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await withDebugToken(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/judge");
  await page.getByRole("button", { name: "Try a practice search" }).click();
  await expect(page).toHaveURL(/\?incident=judge-/, { timeout: 30_000 });
  const incident = new URL(page.url()).searchParams.get("incident")!;
  const clips = page.getByRole("region", { name: "Clips read for this search" });
  await expect(clips).toBeVisible({ timeout: 30_000 });
  await clips.getByRole("button", { name: "Open the time machine" }).click();
  const panel = page.getByRole("dialog", { name: "Time machine" });
  await expect(panel.getByRole("region", { name: "Clip time machine" })).toBeVisible({ timeout: 30_000 });
  // The only clip fetched is the practice clip, from the practice search's own copy.
  const clipFetches = requests.filter((u) => u.includes("firebasestorage.googleapis.com") && u.includes("clips%2F"));
  expect(clipFetches.length).toBeGreaterThan(0);
  for (const u of clipFetches) expect(u).toContain(`clips%2F${incident}%2F${PRACTICE_CLIP}.mp4`);
  // A stored track: no offer to read one, and the box is on the clock at the clearest frame.
  await expect(panel.getByRole("button", { name: "Track the person" })).toHaveCount(0);
  await panel.getByRole("button", { name: /^Clearest frame / }).click();
  await expect(panel.getByTestId("clip-track-box")).toBeVisible({ timeout: 10_000 });
  // The 3D view is wide enough to read, and the page keeps its frame rate while the clip plays.
  expect((await panel.locator(".tm-stage").boundingBox())!.width).toBeGreaterThanOrEqual(560);
  await panel.locator("video").evaluate((v: HTMLVideoElement) => v.play());
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const frame = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(frame);
          else resolve((n * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(frame);
      }),
  );
  expect(fps).toBeGreaterThanOrEqual(55);
  const axe = await new AxeBuilder({ page }).include(".clip-tm-panel").withTags(TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  // Nothing in the whole visit asked a model anything.
  expect(requests.filter((u) => AI_HOST.test(u))).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("time-machine-deployed.png") });
});
