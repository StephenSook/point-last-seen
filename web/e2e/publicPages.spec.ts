import { deployedOnly, expect, test } from "./fixtures";

// The privacy and support pages are static: their text is in the HTML the server sends, so a reviewer's fetch, a
// browser with scripts off, and a visitor the service worker already controls all read the same words.
const PAGES = [
  { path: "/privacy", heading: "Privacy" },
  { path: "/support", heading: "Support" },
] as const;

for (const p of PAGES) {
  test(`${p.path} carries its text in the served HTML, not the app shell`, { tag: "@no-backend" }, async ({ request }) => {
    const res = await request.get(p.path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<h1>${p.heading}</h1>`);
    expect(html).not.toContain('id="root"');
  });

  test(`${p.path} reads with scripts off`, { tag: "@no-backend" }, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(p.path);
      await expect(page).toHaveTitle(`${p.heading}: Point Last Seen`);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      await expect(page.getByRole("link", { name: p.heading === "Privacy" ? "Support" : "Privacy" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test("support says what the app is, that it runs practice searches, and where to get help", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByText("Plans where to search for a missing person, and updates the map as reports come in.")).toBeVisible();
  await expect(page.getByTestId("support-practice")).toContainText("practice");
  const help = page.getByRole("link", { name: "GitHub issues" });
  await expect(help).toHaveAttribute("href", "https://github.com/StephenSook/point-last-seen/issues");
});

test("a visitor the service worker already controls still gets each static page", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 });
  for (const p of PAGES) {
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
    await expect(page.locator("#root")).toHaveCount(0);
  }
});

test("the live privacy and support pages carry no draft text", async ({ request }) => {
  deployedOnly();
  for (const p of PAGES) {
    const html = await (await request.get(p.path, { headers: { "Cache-Control": "no-cache" } })).text();
    expect(html, p.path).not.toContain("DRAFT");
  }
});
