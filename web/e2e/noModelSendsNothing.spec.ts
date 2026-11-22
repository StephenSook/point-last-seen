import { deployedOnly, expect, joinCommand, openDetails, test, withDebugToken } from "./fixtures";

// The SDK sends even an ONLY_ON_DEVICE call to the cloud when the browser has no LanguageModel
// (firebase-js-sdk #10635); the gate (src/ai/gate.ts) stops it before any SDK call. With LanguageModel removed before
// load, each on-device-only path is pressed up to its no-model answer, short of any consent or cloud button, and no
// request may go to a model host, carry a model method, or reach the unresolvable fallback host the private reads use.
// Deployed-only: the command post's reads run against the live drill.

const MODEL_REQUEST = /firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com|firebaseml\.googleapis\.com|:generateContent|:streamGenerateContent|:countTokens|on-device-only\.invalid/;
// A real 1x1 PNG, so the page's JPEG step decodes it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("with no built-in model, the on-device-only reads send nothing to any model", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const sent: string[] = [];
  page.on("request", (r) => { if (MODEL_REQUEST.test(r.url())) sent.push(`${r.method()} ${r.url().split("?")[0]}`); });

  // The judge's page: Get this device ready.
  await page.goto("/judge");
  await page.getByRole("button", { name: "Get this device ready" }).click();
  await expect(page.getByTestId("d2-state")).toHaveAttribute("data-state", "no-model");
  expect(sent).toEqual([]);

  // The command post: Read the note, up to its no-model answer (the cloud read needs a consent tap, not pressed).
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add sighting" }).first().click();
  const form = page.locator(".sighting-form");
  await form.getByLabel(/^Note/).fill("Training drill. A man in a red coat by the creek, heading north.");
  await form.getByRole("button", { name: "Read the note" }).click();
  await expect(form.getByText("This device has no local model. Nothing was sent.")).toBeVisible({ timeout: 30_000 });
  expect(sent).toEqual([]);
  await form.getByRole("button", { name: "Cancel" }).click();

  // The paper debrief sheet: a photo of it, read on this laptop only.
  await openDetails(page);
  const sheet = page.getByRole("button", { name: "Read the paper sheet" }).first();
  await sheet.click();
  await page.getByLabel("Photo of the sheet").setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("This device has no on-device model that reads images, so the sheet was not read. Add the debrief by hand.")).toBeVisible({ timeout: 30_000 });
  expect(sent).toEqual([]);
});
