import { expect, test, type Page } from "@playwright/test";

// The paper debrief read on the debrief harness: ?paper=sample reads a filled sheet for AA, ?paper=other a sheet for
// AB, ?paper=refuse a laptop with no on-device model. The read runs the real cleaning on a canned on-device reply.

const saved = async (page: Page) => JSON.parse((await page.getByTestId("saved").innerText()) || "null") as unknown;
// A real 1x1 PNG, so the page's JPEG step decodes it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const FIELDS = ["Team", "Segment", "Minutes searched", "Coverage ticked", "What worked", "What did not work", "Clues: what and where", "Hazards: what and where"];
const tick = (row: ReturnType<Page["getByTestId"]>, field: string) => row.getByRole("checkbox", { name: `${field}: check this against the paper` });

async function readSheet(page: Page, paper: string) {
  await page.goto(`/harness/debrief.html?paper=${paper}`);
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  await row.getByLabel("Photo of the sheet").setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: PNG });
  return row;
}

test("no paper read is offered where the page gives none", async ({ page }) => {
  await page.goto("/harness/debrief.html");
  await expect(page.getByRole("button", { name: "Read the paper sheet" })).toHaveCount(0);
});

test("reading the sheet fills every box, asks for each to be checked, and saves only when all are", async ({ page }) => {
  const row = await readSheet(page, "sample");
  await expect(row.getByLabel("Team", { exact: true })).toHaveValue("Team 1");
  await expect(row.getByLabel("Segment", { exact: true })).toHaveValue("AA");
  await expect(row.getByLabel("Minutes searched", { exact: true })).toHaveValue("45");
  await expect(row.getByLabel("Coverage ticked", { exact: true })).toHaveValue("75");
  await expect(row.getByLabel("What worked", { exact: true })).toHaveValue("LINE SEARCH 10 M APART ALONG THE CREEK");
  await expect(row.getByLabel("Hazards: what and where", { exact: true })).toHaveValue("LOOSE ROCK BY THE OVERLOOK");
  // The read went to the model as a JPEG.
  await expect(page.getByTestId("read-jpeg")).toHaveText(/^\/9j\//);
  await expect(row.getByText("Ran: on this laptop (reported by the SDK).")).toBeVisible();
  await expect(row.getByText("Sent: nothing left this laptop.")).toBeVisible();

  const save = row.getByRole("button", { name: "Save debrief" });
  for (const f of FIELDS.slice(0, -1)) await tick(row, f).check();
  await expect(save).toBeDisabled();
  await expect(row.getByText("Check every box against the paper to save.")).toBeVisible();
  await tick(row, FIELDS[FIELDS.length - 1]).check();
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => saved(page)).toEqual({
    segmentId: "AA",
    input: { tookMinutes: 45, worked: "LINE SEARCH 10 M APART ALONG THE CREEK", didNotWork: "THICK BRUSH ON THE NORTH SLOPE", coverageStatedPct: 75, clues: "BLUE SCARF ON TRAIL MARKER 4", hazards: "LOOSE ROCK BY THE OVERLOOK" },
    existing: false,
    clearedEventId: "a".repeat(32),
  });
  await expect(row.getByLabel("Minutes searched", { exact: true })).toHaveCount(0);
});

test("changing a box clears its tick, so what is saved is what command checked", async ({ page }) => {
  const row = await readSheet(page, "sample");
  for (const f of FIELDS) await tick(row, f).check();
  await row.getByLabel("Minutes searched", { exact: true }).fill("50");
  await expect(tick(row, "Minutes searched")).not.toBeChecked();
  await expect(row.getByRole("button", { name: "Save debrief" })).toBeDisabled();
  await tick(row, "Minutes searched").check();
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect.poll(async () => ((await saved(page)) as { input: { tookMinutes: number } } | null)?.input.tookMinutes).toBe(50);
});

test("a sheet for another segment is flagged and cannot be saved here until its segment box is this one", async ({ page }) => {
  const row = await readSheet(page, "other");
  await expect(row.getByText("This sheet is for segment AB, not AA.")).toBeVisible();
  for (const f of FIELDS) await tick(row, f).check();
  const save = row.getByRole("button", { name: "Save debrief" });
  await expect(save).toBeDisabled();
  await expect(row.getByText("Save needs the segment box to read AA.")).toBeVisible();
  await row.getByLabel("Segment", { exact: true }).fill("AA");
  await tick(row, "Segment").check();
  await expect(save).toBeEnabled();
});

test("a refused read says why, saves nothing and keeps nothing", async ({ page }) => {
  const row = await readSheet(page, "refuse");
  await expect(row.getByRole("alert")).toHaveText("This laptop has no on-device model that reads images, so the sheet was not read. Add the debrief by hand.");
  await expect(row.getByLabel("Minutes searched", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("saved")).toHaveText("");
});

test("the photo is never kept: no storage, and no object URL left open", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __urls: { made: number; revoked: number } };
    w.__urls = { made: 0, revoked: 0 };
    const make = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (o) => (w.__urls.made++, make(o));
    URL.revokeObjectURL = (u) => (w.__urls.revoked++, revoke(u));
  });
  const row = await readSheet(page, "sample");
  for (const f of FIELDS) await tick(row, f).check();
  await row.getByRole("button", { name: "Save debrief" }).click();
  await expect.poll(() => saved(page)).not.toBeNull();
  const kept = await page.evaluate(async () => ({
    idb: (await indexedDB.databases()).length,
    local: localStorage.length,
    session: sessionStorage.length,
    urls: (window as unknown as { __urls: { made: number; revoked: number } }).__urls,
  }));
  expect(kept.idb).toBe(0);
  expect(kept.local).toBe(0);
  expect(kept.session).toBe(0);
  expect(kept.urls.made - kept.urls.revoked).toBe(0);
});

// A stand-in camera: counts each request and keeps its tracks, so the check can see every one end. With `manual`,
// the browser's permission answer waits until the check calls window.__grant().
async function fakeCamera(page: Page, manual = false) {
  await page.addInitScript((manualGrant) => {
    const w = window as unknown as { __cam: { calls: number; tracks: MediaStreamTrack[] }; __grant: () => void };
    w.__cam = { calls: 0, tracks: [] };
    let granted: () => void = () => undefined;
    const answer = new Promise<void>((resolve) => (granted = resolve));
    w.__grant = () => granted();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          w.__cam.calls++;
          if (manualGrant) await answer;
          const c = document.createElement("canvas");
          c.width = 320;
          c.height = 240;
          const g = c.getContext("2d")!;
          const draw = () => {
            g.fillStyle = "#888";
            g.fillRect(0, 0, 320, 240);
          };
          draw();
          setInterval(draw, 100);
          const s = c.captureStream(10);
          w.__cam.tracks.push(...s.getTracks());
          return s;
        },
      },
    });
  }, manual);
}
const cam = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as { __cam: { calls: number; tracks: MediaStreamTrack[] } }).__cam;
  return { calls: c.calls, tracks: c.tracks.length, ended: c.tracks.every((t) => t.readyState === "ended") };
});

test("the laptop camera is asked for only on a click, and every track stops when the photo is taken", async ({ page }) => {
  await fakeCamera(page);
  await page.goto("/harness/debrief.html?paper=sample");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  expect((await cam(page)).calls).toBe(0);
  await row.getByRole("button", { name: "Use the laptop camera" }).click();
  await expect(row.getByRole("button", { name: "Take the photo" })).toBeEnabled();
  expect(await cam(page)).toMatchObject({ calls: 1, tracks: 1, ended: false });
  await row.getByRole("button", { name: "Take the photo" }).click();
  await expect(row.getByLabel("Minutes searched", { exact: true })).toHaveValue("45");
  expect(await cam(page)).toMatchObject({ calls: 1, ended: true });
});

test("closing the read with the camera open stops every track", async ({ page }) => {
  await fakeCamera(page);
  await page.goto("/harness/debrief.html?paper=sample");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  await row.getByRole("button", { name: "Use the laptop camera" }).click();
  await expect(row.getByRole("button", { name: "Take the photo" })).toBeEnabled();
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(row.getByRole("button", { name: "Read the paper sheet" })).toBeVisible();
  expect(await cam(page)).toMatchObject({ calls: 1, tracks: 1, ended: true });
});

test("a photo picked while the camera is being asked for wins, and the camera stops when it arrives", async ({ page }) => {
  await fakeCamera(page, true);
  await page.goto("/harness/debrief.html?paper=sample");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  await row.getByRole("button", { name: "Use the laptop camera" }).click();
  await row.getByLabel("Photo of the sheet").setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: PNG });
  await expect(row.getByLabel("Minutes searched", { exact: true })).toHaveValue("45");
  await page.evaluate(() => (window as unknown as { __grant: () => void }).__grant());
  await expect.poll(() => cam(page)).toMatchObject({ calls: 1, tracks: 1, ended: true });
  // The read stays on screen; the late camera never takes it over.
  await expect(row.getByRole("button", { name: "Take the photo" })).toHaveCount(0);
  await expect(row.getByLabel("Minutes searched", { exact: true })).toHaveValue("45");
});

test("a photo cancelled before it is read never reaches the model", async ({ page }) => {
  // Hold the photo's decoding, so Cancel lands between choosing the photo and the read.
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((...a: Parameters<typeof createImageBitmap>) =>
      new Promise((resolve) => setTimeout(resolve, 1500)).then(() => decode(...a))) as typeof createImageBitmap;
  });
  await page.goto("/harness/debrief.html?paper=sample");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  await row.getByLabel("Photo of the sheet").setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: PNG });
  await row.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("read-count")).toHaveText("0");
  await expect(row.getByRole("button", { name: "Read the paper sheet" })).toBeVisible();
});

test("closing the Details that holds the section stops every camera track", async ({ page }) => {
  await fakeCamera(page);
  await page.goto("/harness/debrief.html?paper=sample&details=1");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  await row.getByRole("button", { name: "Use the laptop camera" }).click();
  await expect(row.getByRole("button", { name: "Take the photo" })).toBeEnabled();
  expect(await cam(page)).toMatchObject({ calls: 1, tracks: 1, ended: false });
  await page.locator("summary", { hasText: "Details" }).click();
  await expect.poll(() => cam(page)).toMatchObject({ calls: 1, tracks: 1, ended: true });
  // Opened again, the read offers a photo or the camera; the camera is not running.
  await page.locator("summary", { hasText: "Details" }).click();
  await expect(row.getByRole("button", { name: "Use the laptop camera" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Take the photo" })).toHaveCount(0);
});

test("while it reads, the paper read says the first read can be slow, so a long wait does not look stuck", async ({ page }) => {
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((...a: Parameters<typeof createImageBitmap>) =>
      new Promise((resolve) => setTimeout(resolve, 1500)).then(() => decode(...a))) as typeof createImageBitmap;
  });
  await page.goto("/harness/debrief.html?paper=sample");
  const row = page.getByTestId("debrief-AA");
  await row.getByRole("button", { name: "Read the paper sheet" }).click();
  await row.getByLabel("Photo of the sheet").setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: PNG });
  await expect(row.getByRole("status")).toHaveText("Reading the sheet on this laptop. The first read can take up to a minute.");
  await expect(row.getByLabel("Minutes searched", { exact: true })).toHaveValue("45");
});
