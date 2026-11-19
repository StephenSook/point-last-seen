import { expect, test } from "@playwright/test";

test("each question shows the family's answer, or that none came yet", async ({ page }) => {
  await page.goto("/harness/family.html");
  const s = page.getByRole("region", { name: "Family" });
  await expect(s.getByTestId("question-q1")).toContainText("Answer: Bea, and Mom to the grandkids");
  await expect(s.getByTestId("question-q2")).toContainText("No answer yet.");
});

test("a template fills the question, and Ask sends it", async ({ page }) => {
  await page.goto("/harness/family.html");
  await page.getByRole("button", { name: "What were they wearing when you last saw them?" }).click();
  await expect(page.getByLabel("Question for the family")).toHaveValue("What were they wearing when you last saw them?");
  await page.getByRole("button", { name: "Ask the family" }).click();
  await expect(page.getByTestId("asked")).toHaveText("What were they wearing when you last saw them?");
  await expect(page.getByLabel("Question for the family")).toHaveValue("");
});

test("an empty question is refused with the reason", async ({ page }) => {
  await page.goto("/harness/family.html");
  await page.getByRole("button", { name: "Ask the family" }).click();
  await expect(page.getByRole("alert")).toHaveText("Type a question first.");
  await expect(page.getByTestId("asked")).toHaveText("");
});

test("telling the family the search is paused asks first, then shows what they were told", async ({ page }) => {
  await page.goto("/harness/family.html");
  await page.getByRole("button", { name: "Paused" }).click();
  await expect(page.getByText("Tell the family the search is paused? They get a notice with no details.")).toBeVisible();
  await page.getByRole("button", { name: "Tell the family" }).click();
  await expect(page.getByText("The family was told: paused.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Paused" })).toHaveAttribute("aria-pressed", "true");
});

test("there is no control for found or condition news", async ({ page }) => {
  await page.goto("/harness/family.html");
  const s = page.getByRole("region", { name: "Family" });
  await expect(s.getByRole("button", { name: /found|condition|injur|deceased/i })).toHaveCount(0);
  await expect(s).toContainText("News of a find or their condition goes from the search lead in person, not here.");
});

test("a refused ask or state change says so", async ({ page }) => {
  await page.goto("/harness/family.html?fail=1");
  await page.getByLabel("Question for the family").fill("Where did they work?");
  await page.getByRole("button", { name: "Ask the family" }).click();
  await expect(page.getByRole("alert")).toHaveText("The question was not sent. Try again.");
  await expect(page.getByLabel("Question for the family")).toHaveValue("Where did they work?");
});
