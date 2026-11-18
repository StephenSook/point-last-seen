import { AI_HOSTS, expect, test } from "./fixtures";

test("with no built-in model D2 shows the no-model message and sends nothing", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => { delete (window as { LanguageModel?: unknown }).LanguageModel; });
  const hits: string[] = [];
  page.on("request", (r) => { if (AI_HOSTS.test(r.url())) hits.push(r.url()); });
  await page.goto("/judge");
  await expect(page.getByRole("heading", { name: "Judge's door" })).toBeVisible();
  await page.getByRole("button", { name: "Get this laptop ready" }).click();
  await expect(page.getByTestId("d2-state")).toHaveAttribute("data-state", "no-model");
  await expect(page.getByTestId("d2-state")).toHaveText("This browser has no built-in model. Nothing private was sent.");
  await expect(page.getByText(/replay above/)).toHaveCount(0);
  expect(hits).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("before a run is published the page says so", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByRole("region", { name: "Numbers" }).getByText("No published run yet.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Replay the training drill" }).getByText("No published run yet.")).toBeVisible();
  await expect(page.getByText("Training drill. Nobody is missing.")).toBeVisible();
});
