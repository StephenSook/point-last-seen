import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_HOSTS, deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// Deployed-only (Storage takes the clip only from the deployed origin). The generated clip has no
// person, so the full path runs (consent record, upload, one cloud read of the inline video) and
// ends in "Couldn't read this clip", which changes nothing on the map. Each run makes a fresh clip
// (the square at a random height), because a record left by an earlier run's user can only be
// renewed by that user.
const CLIP = join(mkdtempSync(join(tmpdir(), "pls-clip-")), "moving-box.mp4");
test.beforeAll(() => {
  execFileSync("sh", [fileURLToPath(new URL("./assets/make-moving-box.sh", import.meta.url)), CLIP, String(Math.floor(Math.random() * 200))]);
});

test("a staged clip with no person is read once in the cloud as inline video and changes nothing", async ({ page }) => {
  test.setTimeout(180_000);
  deployedOnly();
  await withDebugToken(page);
  const reads: { mime: string | undefined; status: number }[] = [];
  page.on("response", async (r) => {
    if (!AI_HOSTS.test(r.url()) || r.request().method() !== "POST") return;
    const body = JSON.parse(r.request().postData() ?? "{}") as { contents?: { parts?: { inlineData?: { mimeType?: string } }[] }[] };
    reads.push({ mime: body.contents?.[0]?.parts?.find((p) => p.inlineData)?.inlineData?.mimeType, status: r.status() });
  });
  await joinCommand(page);
  const code = page.getByTestId("convergence-code");
  await expect(code).not.toHaveText("----", { timeout: 20_000 });
  const before = await code.innerText();
  await page.getByRole("button", { name: "Add camera clip" }).click();
  await page.getByLabel("Clip", { exact: true }).setInputFiles(CLIP);
  await expect(page.getByTestId("clip-facts")).toHaveText(/^6 s, [0-9]+ KB$/);
  await page.getByLabel("Clip starts at").fill("2026-11-22T14:05:00");
  await page.getByRole("radio", { name: "East", exact: true }).check();
  for (const c of ["The person in the clip", "The owner of the footage", "Cloud reading"]) await page.getByLabel(c).check();
  await page.getByRole("button", { name: "Read clip" }).click();
  await expect(page.getByText("Couldn't read this clip. Nothing changed.")).toBeVisible({ timeout: 150_000 });
  expect(reads).toEqual([{ mime: "video/mp4", status: 200 }]);
  await expect(code).toHaveText(before);
});
