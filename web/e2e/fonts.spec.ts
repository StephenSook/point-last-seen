import { expect, test } from "./fixtures";

// Spec 22.1 fonts: DINish for text and numbers, Ioskeley Mono for 12 px caps labels,
// DSEG7 Classic for the clock, all self-hosted (no third-party font host).
test("the self-hosted fonts load from this origin and DINish digits are tabular", async ({ page, consoleErrors }) => {
  const fontHosts: string[] = [];
  page.on("request", (r) => { if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/.test(r.url())) fontHosts.push(r.url()); });
  await page.goto("/");
  await page.getByLabel("Join code").waitFor();
  const r = await page.evaluate(async () => {
    await Promise.all([document.fonts.load('400 15px "DINish"'), document.fonts.load('600 12px "Ioskeley Mono"'), document.fonts.load('700 20px "DSEG7 Classic"')]);
    const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
    const width = (text: string) => {
      const s = document.createElement("span");
      s.style.cssText = 'font: 400 40px "DINish"; font-variant-numeric: tabular-nums; position: absolute; white-space: pre';
      s.textContent = text;
      document.body.append(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    return { loaded, ones: width("1111"), eights: width("8888"), body: getComputedStyle(document.body).fontFamily, label: getComputedStyle(document.querySelector("label")!).fontFamily };
  });
  expect(r.loaded).toEqual(expect.arrayContaining(["DINish", "Ioskeley Mono", "DSEG7 Classic"]));
  expect(Math.abs(r.ones - r.eights), `1111 ${r.ones} vs 8888 ${r.eights}`).toBeLessThan(0.5);
  expect(r.body.startsWith('"DINish"') || r.body.startsWith("DINish")).toBe(true);
  expect(fontHosts).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
