import { AI_HOSTS, deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// The receipt's "Sent" line is what left the laptop. With no built-in model, the on-device read of a sighting note
// sends nothing to an AI host; after the consent tap the cloud read sends one request to the server prompt template,
// whose whole body is the note with phone numbers removed, and the receipt counts exactly that note's bytes.
// Deployed-only: the cloud read needs the live AI Logic template.

const TYPED = "Training drill. A caller saw a man in a red coat by the creek, call 404 555 0142 if found.";
const SENT_NOTE = "Training drill. A caller saw a man in a red coat by the creek, call [number removed] if found.";

test("a consented cloud note read sends exactly the note the receipt counts, and the on-device try sends nothing", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const sent: { url: string; body: unknown; raw: string }[] = [];
  page.on("request", (r) => {
    if (!AI_HOSTS.test(r.url()) || r.method() !== "POST") return;
    const raw = r.postData() ?? "";
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    sent.push({ url: r.url(), body, raw });
  });
  await joinCommand(page);
  await page.getByRole("button", { name: "Add sighting" }).first().click();
  await page.getByLabel("Note").fill(TYPED);
  await page.getByRole("button", { name: "Read the note" }).click();
  await expect(page.getByText("This laptop has no local model. Nothing was sent.").last()).toBeVisible();
  // The on-device route asked no AI host.
  expect(sent).toEqual([]);

  await page.getByRole("button", { name: "Read in the cloud" }).click();
  // Before the tap, the consent shows the exact note the read will send, and how many numbers were removed.
  const shown = page.getByTestId("consent-note");
  await expect(shown).toHaveText(SENT_NOTE);
  await expect(page.getByText("1 phone number removed.", { exact: true })).toBeVisible();
  const shownText = await shown.textContent();
  await page.getByRole("button", { name: "I consent for this note" }).click();
  const form = page.locator(".sighting-form");
  const receipt = form.getByRole("group").filter({ has: page.getByText("What ran", { exact: true }) });
  await expect(receipt).toBeAttached({ timeout: 90_000 });
  await receipt.getByText("What ran", { exact: true }).click();
  await expect(receipt).toContainText("Ran: in the cloud (reported by the SDK).");

  expect(sent).toHaveLength(1);
  const [call] = sent;
  expect(call!.url).toMatch(/\/templates\/[^/:?]+:templateGenerateContent(\?|$)/);
  // The whole body: the template's one variable, the note with its number removed. No other field, nothing missing.
  expect(call!.body).toEqual({ inputs: { note: SENT_NOTE } });
  // What the person approved is what was sent, character for character.
  expect((call!.body as { inputs: { note: string } }).inputs.note).toBe(shownText);
  expect(call!.raw).not.toMatch(/0142/);
  // The receipt counts exactly the bytes of that note.
  const bytes = new TextEncoder().encode(SENT_NOTE).length;
  await expect(receipt).toContainText(`Sent: ${bytes.toLocaleString("en-US")} bytes of the note, with phone numbers removed.`);

  await form.getByRole("button", { name: "Cancel" }).click();
});
