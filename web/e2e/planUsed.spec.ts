import { AI_HOSTS, deployedOnly, expect, joinCommand, test, withDebugToken } from "./fixtures";

// On the cloud path (no built-in model), the plan's reason codes must be used, not fall back every time: at least two
// of three Suggest plan presses show the model's choice. A press whose answer was not used records the model's reply,
// so a refusal is diagnosable. Nothing is approved, so nothing is written. Deployed-only: the cloud call needs the live
// AI Logic project.
test("Suggest plan on the cloud path uses the model's choice at least two times in three", async ({ page }, info) => {
  deployedOnly();
  await withDebugToken(page);
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const replies: string[] = [];
  page.on("response", async (r) => {
    if (!AI_HOSTS.test(r.url()) || r.request().method() !== "POST") return;
    try {
      const body = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      replies.push(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no text)");
    } catch {
      replies.push(`(HTTP ${r.status()})`);
    }
  });
  await joinCommand(page);
  await expect(page.locator(".plate:visible").first()).toBeVisible({ timeout: 20_000 });
  const plan = page.getByRole("region", { name: "Plan" });
  const suggested = page.getByTestId("suggested-plan");
  let used = 0;
  const notUsed: string[] = [];
  for (let i = 0; i < 3; i++) {
    const before = replies.length;
    await expect(plan.getByRole("button", { name: "Suggest plan" })).toBeEnabled({ timeout: 60_000 });
    await plan.getByRole("button", { name: "Suggest plan" }).click();
    // The press is over when the button stops saying Suggesting; the suggestion on screen is then this press's.
    await expect(plan.getByRole("button", { name: "Suggest plan" })).toBeVisible({ timeout: 90_000 });
    await expect(suggested).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => replies.length, { timeout: 30_000 }).toBeGreaterThan(before);
    // The route mark says where the wording came from: "rules" is the fixed wording, used when the model's was not.
    const path = await suggested.getByTestId("route-glyph").getAttribute("data-path");
    if (path === "rules") notUsed.push(replies.at(-1) ?? "");
    else used++;
  }
  await info.attach("cloud replies not used", { body: notUsed.join("\n---\n") || "(none)", contentType: "text/plain" });
  expect(used, `replies not used:\n${notUsed.join("\n---\n")}`).toBeGreaterThanOrEqual(2);
  // Not approved: no plan was written.
  await expect(page.getByTestId("plan-status")).toHaveCount(0);
});
