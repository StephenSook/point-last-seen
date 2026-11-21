import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The privacy page publishes the approved policy word for word, and the support page carries its approved lines;
// both are static, so this is what a signed-out reviewer's fetch reads.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// Every block in these pages starts on its own source line, so removing a tag never joins two words.
function mainText(html: string): string {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/.exec(html.replace(/<!--[\s\S]*?-->/g, ""))?.[1] ?? "";
  return main
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownText(md: string): string {
  return md
    .split("\n")
    .map((l) => l.replace(/^#{1,6} /, "").replace(/^- /, "").replace(/\*\*/g, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the public privacy and support pages", () => {
  it("the privacy page's text is the approved policy, word for word, with its date", () => {
    const md = read("../legal/privacy-policy.md");
    expect(md).toMatch(/^Last updated: [A-Z][a-z]+ \d{1,2}, \d{4}$/m);
    expect(md).not.toContain("[publication date]");
    expect(mainText(read("../privacy.html"))).toBe(markdownText(md));
  });

  it("the support page says what the app is, that drills are made up, where to get help, and links the policy", () => {
    const html = read("../support.html");
    expect(mainText(html)).toBe(
      "Support Point Last Seen is a field app for search team training drills. Every drill uses made-up information. Nobody is missing. Help, questions or a data request: open an issue at https://github.com/StephenSook/point-last-seen/issues. Don't post personal details in an issue. Privacy policy",
    );
    expect(html).toContain('<a href="/privacy">Privacy policy</a>');
    expect(html).toContain('href="https://github.com/StephenSook/point-last-seen/issues"');
  });

  it("neither page carries draft or placeholder text", () => {
    for (const p of ["../privacy.html", "../support.html"]) expect(read(p), p).not.toMatch(/DRAFT|placeholder|\[publication date\]/i);
  });
});
