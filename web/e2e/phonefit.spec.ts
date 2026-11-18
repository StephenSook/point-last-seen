import { expect, test } from "./fixtures";

test.describe("phone fit", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("fields use 16 px text (no zoom on focus) and buttons are at least 44 px tall", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Join code").waitFor();
    for (const label of ["Incident id", "Join code"]) {
      expect(await page.getByLabel(label).evaluate((e) => getComputedStyle(e).fontSize), label).toBe("16px");
    }
    const button = await page.getByRole("button", { name: /Join as command|Connecting/ }).boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(44);
  });
});

