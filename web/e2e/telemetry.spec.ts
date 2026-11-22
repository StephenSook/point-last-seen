import { familyConsentToPhoto } from "./familyConsent";
import { deployedOnly, expect, joinCommand, openDetails, syntheticSignJpeg, test, withDebugToken } from "./fixtures";

// Deployed-only (the photo is read back through Storage). One consented cloud read must leave one
// "hybrid-inference" custom trace in a Performance Monitoring upload, with its four attributes.
test("a consented cloud photo read is traced as hybrid-inference with its route", async ({ page }) => {
  deployedOnly();
  test.setTimeout(120_000);
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (/firebaselogging|firebaseperformance|cc-api-data/.test(r.url()) && r.method() === "POST") uploads.push(r.postData() ?? "");
  });
  const incident = await joinCommand(page);
  await openDetails(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "sign.jpg", mimeType: "image/jpeg", buffer: await syntheticSignJpeg(page) });
  // The cloud read needs the family's consent for this photo: given as the family app gives it.
  const sha = await page.locator(".photo").first().getAttribute("data-sha256");
  await familyConsentToPhoto(incident, sha ?? "");
  await page.getByRole("button", { name: "Read on this device" }).first().click();
  await page.getByRole("button", { name: "Read in the cloud" }).first().click();
  await page.getByRole("button", { name: "Send this photo to the cloud" }).first().click();
  await expect(page.getByTestId("photo-cues").first()).toBeVisible();
  await expect.poll(() => uploads.some((b) => b.includes("hybrid-inference")), { timeout: 60_000 }).toBe(true);
  const body = uploads.find((b) => b.includes("hybrid-inference"))!;
  for (const v of ["consented_cloud_read", "web", "cloud"]) expect(body).toContain(v);
});
