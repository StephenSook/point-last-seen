import { expect, test } from "@playwright/test";

// A forwarded link reaches someone who has not joined: a fresh browser with no saved sign-in. (The live run's saved
// session has joined the test drill as command, and a link to an incident its user may open goes straight to it.)
test.use({ storageState: { cookies: [], origins: [] } });

test("a shared incident link fills in the incident id and says why the code is still needed", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/?incident=drill-test-1");
  await expect(page.getByRole("textbox", { name: "Incident id" })).toHaveValue("drill-test-1");
  await expect(page.getByTestId("link-note")).toHaveText("This link names incident drill-test-1. Enter its join code to open it: a link alone never opens an incident, so a forwarded link does not give anyone access.");
});

test("with no incident in the link there is no note", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Incident id" })).toHaveValue("");
  await expect(page.getByTestId("link-note")).toHaveCount(0);
});
