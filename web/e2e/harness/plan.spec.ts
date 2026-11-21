import { expect, test } from "@playwright/test";

test("the suggested plan names teams by their names, not their document ids", async ({ page }) => {
  await page.goto("/harness/plan.html");
  await page.getByRole("button", { name: "Suggest plan" }).click();
  const card = page.getByTestId("suggested-plan");
  await expect(card.getByRole("listitem").first()).toContainText("Team 1");
  await expect(card.getByRole("listitem").nth(1)).toContainText("Team 2");
  await expect(card.getByText(/^T1$/)).toHaveCount(0);
});

test("a suggestion is withdrawn when the draft's assignments change, so old wording never meets new segments", async ({ page }) => {
  await page.goto("/harness/plan.html");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  await expect(page.getByTestId("suggested-plan")).toBeVisible();
  await page.getByRole("button", { name: "Assignments change" }).click();
  await expect(page.getByTestId("suggested-plan")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
});

test("a reply that arrives after the assignments changed is dropped, not shown or approvable", async ({ page }) => {
  await page.goto("/harness/plan.html?slow=1");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  await page.getByRole("button", { name: "Assignments change" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  // The reply has finished once Suggest plan is enabled again.
  await expect(page.getByRole("button", { name: "Suggest plan" })).toBeEnabled();
  await expect(page.getByTestId("suggested-plan")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
});

test("a reply worded for older probabilities is dropped even when the assignments did not change", async ({ page }) => {
  await page.goto("/harness/plan.html?slow=1");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  await page.getByRole("button", { name: "Probabilities change" }).click();
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(page.getByRole("button", { name: "Suggest plan" })).toBeEnabled();
  await expect(page.getByTestId("suggested-plan")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
});

test("the suggestion's label is the route that ran: Cloud without a local model, On this laptop when it ran here", async ({ page }) => {
  await page.goto("/harness/plan.html?route=cloud");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  await expect(page.getByTestId("suggested-plan").getByTestId("route-glyph")).toHaveText("Cloud");
  await page.goto("/harness/plan.html?route=on_device");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  await expect(page.getByTestId("suggested-plan").getByTestId("route-glyph")).toHaveText("On this laptop");
});

test("a draft with more teams than a plan can name says so and cannot be suggested or approved", async ({ page }) => {
  await page.goto("/harness/plan.html?teams=11");
  await expect(page.getByRole("status").filter({ hasText: "A plan can name at most 8 teams. This draft has 11" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suggest plan" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
});

test("each suggestion carries a closed What ran receipt: asked for, where it ran, the model, what left the laptop", async ({ page }) => {
  await page.goto("/harness/plan.html?route=cloud");
  await page.getByRole("button", { name: "Suggest plan" }).click();
  const receipt = page.getByTestId("suggested-plan").getByRole("group").filter({ has: page.getByText("What ran", { exact: true }) });
  await expect(receipt.getByText("Ran: in the cloud (reported by the SDK).")).toBeHidden();
  await receipt.getByText("What ran", { exact: true }).click();
  await expect(receipt).toContainText("Asked for: this laptop first.");
  await expect(receipt).toContainText("Ran: in the cloud (reported by the SDK).");
  await expect(receipt).toContainText("Model: gemini-3.5-flash-lite.");
  await expect(receipt).toContainText("Sent: 1,234 bytes of plan text.");
});

test("the receipt for a plan worded on this laptop says nothing left it", async ({ page }) => {
  await page.goto("/harness/plan.html?route=on_device");
  await page.getByRole("button", { name: "Suggest plan" }).click();
  const receipt = page.getByTestId("suggested-plan").getByRole("group").filter({ has: page.getByText("What ran", { exact: true }) });
  await receipt.getByText("What ran", { exact: true }).click();
  await expect(receipt).toContainText("Sent: no text or image left this laptop.");
});

test("a fallback plan shows only the fixed-wording mark; why the cloud was not used is in What ran", async ({ page }) => {
  await page.goto("/harness/plan.html?fallback=1");
  await expect(page.getByText(/this laptop/)).toHaveCount(0);
  await page.getByRole("button", { name: "Suggest plan" }).click();
  const plan = page.getByTestId("suggested-plan");
  await expect(plan).toContainText("Fixed wording");
  await expect(plan.getByText("The cloud step did not answer. The plan below uses fixed wording.")).toHaveCount(0);
  await plan.getByText("What ran").click();
  await expect(plan.getByText("Not used: the model call failed. The plan uses fixed wording from code.")).toBeVisible();
});

test("each assignment is one line: the team, its task and its reason", async ({ page }) => {
  await page.goto("/harness/plan.html");
  await page.getByRole("button", { name: "Suggest plan" }).click();
  const items = page.getByTestId("suggested-plan").getByRole("listitem");
  await expect(items).toHaveText(["Team 1 Search AA. Highest.", "Team 2 Search AB. Next."]);
});

test("while the plan is worded, the card says so and that the first time can take up to a minute", async ({ page }) => {
  await page.goto("/harness/plan.html?slow=1");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  const waiting = page.getByRole("status").filter({ hasText: "Wording the plan" });
  await expect(waiting).toHaveText("Wording the plan. The first time on this laptop can take up to a minute.");
  await page.getByRole("button", { name: "Model answers" }).click();
  await expect(waiting).toHaveCount(0);
});

test("a suggestion shows beside the approved plan, team by team, with the probability each plan's segments hold", async ({ page }) => {
  await page.goto("/harness/plan.html?current=1");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  const table = page.getByRole("table", { name: "The approved plan and this suggestion" });
  await expect(table.getByRole("row")).toHaveText([
    /^Team\s*Now\s*Suggested$/,
    /^Team 1\s*AB, 20\.0%\s*AA, 31\.0%$/,
    /^Team 2\s*AC, 5\.0%\s*AB, 20\.0%$/,
    /^In these segments\s*25\.0%\s*51\.0%$/,
  ]);
});

test("with no approved plan yet, a suggestion shows on its own", async ({ page }) => {
  await page.goto("/harness/plan.html");
  await page.getByRole("button", { name: /^Suggest/ }).click();
  await expect(page.getByTestId("suggested-plan")).toBeVisible();
  await expect(page.getByRole("table", { name: "The approved plan and this suggestion" })).toHaveCount(0);
});
