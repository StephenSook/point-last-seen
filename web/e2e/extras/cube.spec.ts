import { expect, test } from "@playwright/test";

const harness = "/extras-harness/judge.html";

test("the cube legend says the lines are not a track", async ({ page }) => {
  await page.goto(harness);
  const section = page.getByRole("region", { name: "Space and time" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Up is time.")).toBeVisible();
  await expect(section.getByText("A bar is a report waiting for signal.")).toBeVisible();
  await expect(section.getByText("Lines join confirmed sightings in order. They are not a track.")).toBeVisible();
});

test("arrow keys turn the cube and the table stays the same", async ({ page }) => {
  await page.goto(harness);
  const section = page.getByRole("region", { name: "Space and time" });
  const figure = section.getByRole("img", { name: /^Space-time view turned to 30 degrees/ });
  const table = section.getByRole("table", { name: "The same reports as numbers" });
  const before = await table.textContent();
  const bar = section.locator("[data-bar]").first();
  const x0 = await bar.getAttribute("x1");
  await figure.focus();
  await page.keyboard.press("ArrowRight");
  await expect(section.getByRole("img", { name: /^Space-time view turned to 45 degrees/ })).toBeVisible();
  expect(await bar.getAttribute("x1")).not.toBe(x0);
  expect(await table.textContent()).toBe(before);
  await expect(table.locator("tbody tr")).toHaveCount(4);
});

test("the longest bar in the picture is the longest wait in the table", async ({ page }) => {
  await page.goto(harness);
  const section = page.getByRole("region", { name: "Space and time" });
  // The cube loads on first use: wait for its bars before reading them.
  await expect(section.locator("line[data-bar]").first()).toBeAttached();
  const ids = await section.evaluate((el) => {
    const bars = [...el.querySelectorAll<SVGLineElement>("line[data-bar]")].map((b) => ({
      id: b.dataset["bar"]!,
      len: Math.hypot(Number(b.getAttribute("x2")) - Number(b.getAttribute("x1")), Number(b.getAttribute("y2")) - Number(b.getAttribute("y1"))),
    }));
    const rows = [...el.querySelectorAll<HTMLTableRowElement>("tr[data-row]")].map((r) => ({ id: r.dataset["row"]!, wait: Number(r.dataset["waitS"] || -1) }));
    return {
      bar: bars.sort((a, b) => b.len - a.len)[0]?.id,
      row: rows.sort((a, b) => b.wait - a.wait)[0]?.id,
    };
  });
  expect(ids.bar).toBeDefined();
  expect(ids.bar).toBe(ids.row);
});

test("a run below the cube's gate draws no cube, and the replay is still there", async ({ page }) => {
  await page.goto(`${harness}?run=thin`);
  await expect(page.getByRole("region", { name: "Watch the run over time" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Space and time" })).toHaveCount(0);
});
