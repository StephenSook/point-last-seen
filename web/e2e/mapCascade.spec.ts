import { expect, test } from "@playwright/test";

// The built app's own stylesheets, in the order the page loads them, must leave the map filling its frame. MapLibre
// gives its container `.maplibregl-map { position: relative }`, the same specificity as our `.map { position: absolute;
// inset: 0 }`, so whichever loads later wins: a build that loads MapLibre's sheet after ours draws a map 0 px tall.
// The join page loads the command post's code and styles, so every sheet the post uses is on the page here.
for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`at ${w} px the map keeps the full height of its frame with every built stylesheet loaded`, { tag: "@no-backend" }, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.getByLabel("Join code")).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("load");
    const box = await page.evaluate(() => {
      const wrap = document.createElement("div");
      wrap.className = "map-wrap";
      wrap.style.height = "400px";
      const map = document.createElement("div");
      map.className = "map maplibregl-map";
      wrap.appendChild(map);
      document.body.appendChild(wrap);
      const r = { height: map.getBoundingClientRect().height, position: getComputedStyle(map).position };
      wrap.remove();
      return r;
    });
    expect(box.position).toBe("absolute");
    expect(box.height).toBe(400);
  });
}
