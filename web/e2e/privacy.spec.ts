import { familyConsentToPhoto } from "./familyConsent";
import { AI_HOSTS, deployedOnly, expect, joinCommand, openDetails, syntheticSignJpeg, test, withDebugToken } from "./fixtures";

// Spec section 15: with no built-in model, a family photo and a caller's note
// reach no AI host. The positive control proves the listener sees requests.
// Deployed-only: the photo is read back through Storage (see deployedOnly).

test("with LanguageModel hidden, private reads send nothing to Firebase hosts", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const hits: string[] = [];
  page.on("request", (r) => { if (AI_HOSTS.test(r.url()) && r.method() === "POST") hits.push(r.url()); });
  await joinCommand(page);
  await openDetails(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "sign.jpg", mimeType: "image/jpeg", buffer: await syntheticSignJpeg(page) });
  await page.getByRole("button", { name: "Read on this laptop" }).first().click();
  await expect(page.getByText("This laptop has no local model. Nothing was sent.").first()).toBeVisible();
  await page.getByRole("button", { name: "Add sighting" }).click();
  await page.getByLabel("Note").fill("saw a woman in a blue coat by the creek");
  await page.getByRole("button", { name: "Read the note" }).click();
  await expect(page.getByText("This laptop has no local model. Nothing was sent.").last()).toBeVisible();
  expect(hits).toEqual([]);
});

// It also checks the cloud call is signed in and carries App Check, so AI Logic can require both
// (App Check replay protection and authenticated users) without the web read breaking.
test("positive control: a consented cloud read sends exactly one AI Logic request, signed in and with App Check", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const hits: string[] = [];
  const signed: { auth: boolean; appCheck: boolean }[] = [];
  page.on("request", (r) => {
    if (!AI_HOSTS.test(r.url()) || r.method() !== "POST") return;
    hits.push(r.url());
    const h = r.headers();
    signed.push({ auth: /^Firebase \S+$/.test(h["authorization"] ?? ""), appCheck: (h["x-firebase-appcheck"] ?? "").length > 0 });
  });
  const incident = await joinCommand(page);
  await openDetails(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "sign.jpg", mimeType: "image/jpeg", buffer: await syntheticSignJpeg(page) });
  // The cloud read needs the family's consent for this photo: given as the family app gives it.
  const sha = await page.locator(".photo").first().getAttribute("data-sha256");
  await familyConsentToPhoto(incident, sha ?? "");
  await page.getByRole("button", { name: "Read on this laptop" }).first().click();
  await page.getByRole("button", { name: "Read in the cloud" }).first().click();
  await page.getByRole("button", { name: "Send this photo to the cloud" }).first().click();
  await expect(page.getByTestId("photo-cues").first()).toBeVisible();
  expect(hits).toHaveLength(1);
  expect(signed).toEqual([{ auth: true, appCheck: true }]);
});
