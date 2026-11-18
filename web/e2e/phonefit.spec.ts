import { expect, test } from "./fixtures";

test.describe("phone fit", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("fields use 16 px text (no zoom on focus) and buttons are at least 44 px tall", { tag: "@no-backend" }, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Join code").waitFor();
    for (const label of ["Incident id", "Join code"]) {
      expect(await page.getByLabel(label).evaluate((e) => getComputedStyle(e).fontSize), label).toBe("16px");
      expect((await page.getByLabel(label).boundingBox())!.height, label).toBeGreaterThanOrEqual(44);
    }
    const button = await page.getByRole("button", { name: /Join as command|Connecting/ }).boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(44);
  });
});

test("the product name is on the join page and the judge page", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Point Last Seen", { exact: true })).toBeVisible();
  await page.goto("/judge");
  await expect(page.getByText("Point Last Seen", { exact: true })).toBeVisible();
});
