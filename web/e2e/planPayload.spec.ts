import { AI_HOSTS, deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// What Suggest plan sends, checked against what the Plan section says it sends: "It sends only team ids, segment codes
// and percents, never a note or a name." With no built-in model the wording goes to the cloud in one request; every line
// of its text is a fixed heading, a team id with its segment codes, or a segment code with its percents, and the
// receipt counts exactly those bytes. Nothing is approved, so nothing is written. Deployed-only: the cloud call needs
// the live AI Logic project.

const HEADINGS = new Set(["Assignments decided by code:", "Segments by POA, highest first:"]);
const TEAM_LINE = /^[A-Za-z0-9_-]+: ?(?:[A-Z]{2}(?:, [A-Z]{2})*)?$/;
const SEGMENT_LINE = /^[A-Z]{2} \d+\.\d% \(was \d+\.\d%\)$/;

test("Suggest plan sends only team ids, segment codes and percents, and the receipt counts exactly that text", async ({ page }) => {
  deployedOnly();
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const sent: { url: string; body: Record<string, unknown> | null }[] = [];
  page.on("request", (r) => {
    if (!AI_HOSTS.test(r.url()) || r.method() !== "POST") return;
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(r.postData() ?? "") as Record<string, unknown>;
    } catch {
      body = null;
    }
    sent.push({ url: r.url(), body });
  });
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const plan = page.getByRole("region", { name: "Plan" });
  await expect(plan.getByText("It sends only team ids, segment codes and percents, never a note or a name.", { exact: false })).toBeVisible();
  await plan.getByRole("button", { name: "Suggest plan" }).click();
  const suggested = page.getByTestId("suggested-plan");
  await expect(suggested).toBeVisible({ timeout: 90_000 });
  await suggested.getByText("What ran", { exact: true }).click();

  expect(sent).toHaveLength(1);
  const [call] = sent;
  expect(call!.url).toMatch(/\/models\/[^/:?]+:generateContent(\?|$)/);
  const contents = (call!.body?.["contents"] ?? []) as { role?: string; parts?: { text?: string }[] }[];
  expect(contents).toHaveLength(1);
  const parts = contents[0]!.parts ?? [];
  expect(parts).toHaveLength(1);
  const text = parts[0]!.text ?? "";
  const lines = text.split("\n");
  expect(lines.length).toBeGreaterThan(3);
  for (const line of lines) expect(HEADINGS.has(line) || TEAM_LINE.test(line) || SEGMENT_LINE.test(line), line).toBe(true);
  // The receipt counts exactly the bytes of that text.
  const bytes = new TextEncoder().encode(text).length;
  await expect(suggested).toContainText(`Sent: ${bytes.toLocaleString("en-US")} bytes of plan text.`);
  // Not approved: no plan was written.
  await expect(page.getByTestId("plan-status")).toHaveCount(0);
});
