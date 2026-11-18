import { AI_HOSTS, expect, joinCommand, syntheticSignJpeg, test, withDebugToken } from "./fixtures";

// Spec section 15: with no built-in model, a family photo and a caller's note
// reach no AI host. The positive control proves the listener sees requests.

test("with LanguageModel hidden, private reads send nothing to Firebase hosts", async ({ page }) => {
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const hits: string[] = [];
  page.on("request", (r) => { if (AI_HOSTS.test(r.url()) && r.method() === "POST") hits.push(r.url()); });
  await joinCommand(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "sign.jpg", mimeType: "image/jpeg", buffer: await syntheticSignJpeg(page) });
  await page.getByRole("button", { name: "Read on this laptop" }).first().click();
  await expect(page.getByText("This laptop has no local model. Nothing was sent.").first()).toBeVisible();
  await page.getByRole("button", { name: "Add sighting" }).click();
  await page.getByLabel("Note").fill("saw a woman in a blue coat by the creek");
  await page.getByRole("button", { name: "Read the note" }).click();
  await expect(page.getByText("This laptop has no local model. Nothing was sent.").last()).toBeVisible();
  expect(hits).toEqual([]);
});

test("positive control: a consented cloud read sends exactly one AI Logic request", async ({ page }) => {
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const hits: string[] = [];
  page.on("request", (r) => { if (AI_HOSTS.test(r.url()) && r.method() === "POST") hits.push(r.url()); });
  await joinCommand(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "sign.jpg", mimeType: "image/jpeg", buffer: await syntheticSignJpeg(page) });
  await page.getByRole("button", { name: "Read on this laptop" }).first().click();
  await page.getByRole("button", { name: "Read in the cloud" }).first().click();
  await page.getByRole("button", { name: "I consent for this photo" }).first().click();
  await expect(page.getByTestId("photo-cues").first()).toBeVisible();
  expect(hits).toHaveLength(1);
});
