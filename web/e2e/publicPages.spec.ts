import { deployedOnly, expect, test } from "./fixtures";

// The privacy and support pages are static: their text is in the HTML the server sends, so a reviewer's fetch, a
// browser with scripts off, and a visitor the service worker already controls all read the same words.
const ISSUES = "https://github.com/StephenSook/point-last-seen/issues";
const PAGES = [
  { path: "/privacy", heading: "Point Last Seen: privacy policy", title: "Privacy policy: Point Last Seen", link: "Support", text: "This page says what the iPhone app collects, why, and where it goes." },
  { path: "/support", heading: "Support", title: "Support: Point Last Seen", link: "Privacy policy", text: "Every drill uses made-up information. Nobody is missing." },
] as const;

for (const p of PAGES) {
  test(`${p.path} carries its text in the served HTML, not the app shell`, { tag: "@no-backend" }, async ({ request }) => {
    const res = await request.get(p.path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<h1>${p.heading}</h1>`);
    expect(html).toContain(p.text);
    expect(html).not.toContain('id="root"');
  });

  test(`${p.path} reads with scripts off`, { tag: "@no-backend" }, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(p.path);
      await expect(page).toHaveTitle(p.title);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      await expect(page.getByText(p.text)).toBeVisible();
      await expect(page.getByRole("link", { name: p.link, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: ISSUES })).toHaveAttribute("href", ISSUES);
    } finally {
      await context.close();
    }
  });
}

test("support says what the app is, that drills are made up, where to get help, and links the policy", { tag: "@no-backend" }, async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByText("Point Last Seen is a field app for search team training drills.")).toBeVisible();
  await expect(page.getByText("Don't post personal details in an issue.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "stevefunds2006@gmail.com" })).toHaveAttribute("href", "mailto:stevefunds2006@gmail.com");
  await expect(page.getByText("about a problem with the app, an abusive post or member, or deleting your data.")).toBeVisible();
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

test("the live support page serves its contact email in the HTML a reviewer fetches", async ({ request }) => {
  deployedOnly();
  const html = await (await request.get("/support", { headers: { "Cache-Control": "no-cache" } })).text();
  expect(html).toContain('<p>Email <a href="mailto:stevefunds2006@gmail.com">stevefunds2006@gmail.com</a> about a problem with the app, an abusive post or member, or deleting your data.</p>');
});

test("the live privacy and support pages carry no draft text", async ({ request }) => {
  deployedOnly();
  for (const p of PAGES) {
    const html = await (await request.get(p.path, { headers: { "Cache-Control": "no-cache" } })).text();
    expect(html, p.path).not.toMatch(/DRAFT|\[publication date\]/);
  }
});
