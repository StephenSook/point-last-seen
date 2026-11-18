import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fontDir = (d: string, f: string) => new URL(`../../public/fonts/${d}/${f}`, import.meta.url);

describe("self-hosted fonts", () => {
  it("every font folder carries its license and source", () => {
    for (const d of ["dinish", "ioskeley-mono", "dseg7-classic"]) {
      expect(existsSync(fontDir(d, "OFL.txt")), d).toBe(true);
      expect(readFileSync(fontDir(d, "OFL.txt"), "utf8")).toMatch(/SIL OPEN FONT LICENSE/);
      expect(readFileSync(fontDir(d, "SOURCE.txt"), "utf8")).toMatch(/github\.com\/.+ [0-9a-f]{40}/);
    }
  });

  it("every @font-face points at a file that is in public/fonts", () => {
    const css = readFileSync(new URL("./fonts.css", import.meta.url), "utf8");
    const urls = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]!);
    expect(urls.length).toBe(3);
    for (const u of urls) expect(existsSync(new URL(`../../public/fonts/${u}`, import.meta.url)), u).toBe(true);
  });
});
