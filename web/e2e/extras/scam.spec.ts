import { expect, test } from "@playwright/test";

const harness = "/extras-harness/judge.html";

test("the camera check shows the count, the gate line, the misses first and every clip", async ({ page }) => {
  await page.goto(`${harness}?scam=ok`);
  const section = page.getByRole("region", { name: "Camera read check" });
  await expect(section).toBeVisible();
  await expect(section.getByText("5 of 6 staged clips passed.")).toBeVisible();
  await expect(section.getByText("This is a go or no-go gate, not an accuracy claim (n = 6).")).toBeVisible();
  await expect(section.getByRole("list", { name: "Misses" }).getByRole("listitem")).toHaveText(["Night clip 2: direction off by 90 degrees (limit 45)."]);
  await expect(section.locator("tbody tr")).toHaveCount(6);
  await expect(section.getByText("Clips were staged with consenting adults. No clip is shown here.")).toBeVisible();
  await expect(section.getByTestId("scam-gate-failed")).toHaveCount(0);
  // The misses come before the table.
  const order = await section.evaluate((el) => {
    const list = el.querySelector("ul");
    const table = el.querySelector("table");
    return list && table ? list.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
  });
  expect(order).toBeTruthy();
});

test("a check that failed its gate says so and still lists its misses", async ({ page }) => {
  await page.goto(`${harness}?scam=fail`);
  const section = page.getByRole("region", { name: "Camera read check" });
  await expect(section.getByTestId("scam-gate-failed")).toHaveText("The camera read did not pass its gate. It is not in this build.");
  await expect(section.getByRole("list", { name: "Misses" }).getByRole("listitem")).toHaveCount(2);
});

test("a file whose stored verdict lies shows the reason and no numbers", async ({ page }) => {
  await page.goto(`${harness}?scam=bad`);
  const section = page.getByRole("region", { name: "Camera read check" });
  await expect(section.getByTestId("scam-refused")).toHaveText("The camera check file was not used. The stored verdict for clip night-2 does not match its errors.");
  await expect(section.locator("table")).toHaveCount(0);
});

test("with no camera check file the section is not drawn", async ({ page }) => {
  await page.goto(`${harness}?scam=none`);
  await expect(page.getByText("Made-up harness data")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Camera read check" })).toHaveCount(0);
});
