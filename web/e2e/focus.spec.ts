import { expect, joinCommand, openDetails, test, withDebugToken } from "./fixtures";

test("keyboard focus on Add photos is visible on its label", async ({ page }) => {
  await withDebugToken(page);
  await joinCommand(page);
  await openDetails(page);
  const tray = page.locator(".tray");
  await tray.getByRole("button", { name: "Get this laptop ready" }).focus();
  await page.keyboard.press("Tab");
  const input = tray.locator('input[type="file"]');
  await expect(input).toBeFocused();
  const outline = await tray.locator("label.file").evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});
