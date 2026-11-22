import { FACT_CODES } from "../src/ai/reasonCodes";
import { AI_HOSTS, deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// What Suggest plan sends, checked against what the Plan section says it sends: "It sends only team ids, segment codes
// and fact codes, never a note or a name." With no built-in model the request goes to the cloud; every line of its text
// is the fixed heading, a team id with its segment codes and its facts (each a known fact code with segment codes), or
// a team with no segment, and the receipt counts exactly those bytes. Nothing is approved, so nothing is written. Deployed-only: the cloud call needs
// the live AI Logic project.

const HEADINGS = new Set(["Teams, their segments, and the facts code found for those segments:"]);
const IDS = String.raw`[A-Z]{2}(?:, [A-Z]{2})*`;
const FACT = String.raw`([a-z_]+) \(${IDS}\)`;
const TEAM_LINE = new RegExp(`^[A-Za-z0-9_-]+ searches ${IDS}\\. Facts: ${FACT}(?:, ${FACT})*$`);
const NO_SEGMENT_LINE = /^[A-Za-z0-9_-]+ has no segment\. Facts: none\.$/;
const KNOWN = new Set<string>(FACT_CODES);
const factCodes = (line: string) => [...line.slice(line.indexOf("Facts: ") + 7).matchAll(/([a-z_]+) \(/g)].map((m) => m[1]!);

test("Suggest plan sends only team ids, segment codes and fact codes, and the receipt counts exactly that text", async ({ page }) => {
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
  await expect(plan.getByText("It sends only team ids, segment codes and fact codes, never a note or a name.", { exact: false })).toBeVisible();
  // Other live checks write reports to this drill at the same time; a reply for a draft that has changed meanwhile is
  // never shown (by design), so press again, up to three times.
  const suggested = page.getByTestId("suggested-plan");
  for (let i = 0; i < 3 && !(await suggested.isVisible()); i++) {
    await expect(plan.getByRole("button", { name: "Suggest plan" })).toBeEnabled({ timeout: 60_000 });
    await plan.getByRole("button", { name: "Suggest plan" }).click();
    await suggested.waitFor({ timeout: 45_000 }).catch(() => undefined);
  }
  await expect(suggested).toBeVisible();
  await suggested.getByText("What ran", { exact: true }).click();

  // Every request the presses sent holds only the plan table, one content with one text part.
  expect(sent.length).toBeGreaterThan(0);
  const texts = sent.map((call) => {
    expect(call.url).toMatch(/\/models\/[^/:?]+:generateContent(\?|$)/);
    const contents = (call.body?.["contents"] ?? []) as { role?: string; parts?: { text?: string }[] }[];
    expect(contents).toHaveLength(1);
    const parts = contents[0]!.parts ?? [];
    expect(parts).toHaveLength(1);
    const text = parts[0]!.text ?? "";
    const lines = text.split("\n");
    expect(lines.some((l) => TEAM_LINE.test(l))).toBe(true);
    for (const line of lines) expect(HEADINGS.has(line) || TEAM_LINE.test(line) || NO_SEGMENT_LINE.test(line), line).toBe(true);
    for (const line of lines.filter((l) => TEAM_LINE.test(l))) for (const c of factCodes(line)) expect(KNOWN.has(c), c).toBe(true);
    return text;
  });
  // The receipt shown counts exactly the bytes of the last request, the one whose reply is on screen.
  const bytes = new TextEncoder().encode(texts.at(-1)!).length;
  await expect(suggested).toContainText(`Sent: ${bytes.toLocaleString("en-US")} bytes of plan text.`);
  // Not approved: no plan was written.
  await expect(page.getByTestId("plan-status")).toHaveCount(0);
});
