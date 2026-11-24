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
      "Support Point Last Seen is a field app for search team training drills. Every drill uses made-up information. Nobody is missing. Email stevefunds2006@gmail.com about a problem with the app, an abusive post or member, or deleting your data. Help, questions or a data request: open an issue at https://github.com/StephenSook/point-last-seen/issues. Don't post personal details in an issue. When the command post website hits an error, it sends an error report with none of your text in it; the privacy policy says what a report holds. Privacy policy",
    );
    expect(html).toContain('<a href="/privacy">Privacy policy</a>');
    expect(html).toContain('href="https://github.com/StephenSook/point-last-seen/issues"');
  });

  // App Review (guideline 1.2): published contact for an app with user content, the address the owner chose.
  it("the support page gives one email address to write to, as a mailto link, and says what to write about", () => {
    const html = read("../support.html");
    expect(html).toContain('<p>Email <a href="mailto:stevefunds2006@gmail.com">stevefunds2006@gmail.com</a> about a problem with the app, an abusive post or member, or deleting your data.</p>');
    expect(html.match(/mailto:/g)).toHaveLength(1);
    expect(html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g)).toEqual(["stevefunds2006@gmail.com", "stevefunds2006@gmail.com"]);
  });

  // The website's error-report words must agree with the code that sends the reports (src/telemetry/).
  it("says what the website's error reports hold exactly as the reporting code builds them", () => {
    const text = markdownText(read("../legal/privacy-policy.md"));
    expect(text).toContain("This page says what the iPhone app collects, why, and where it goes. Its section on the command post website says what that website sends when it hits an error.");
    expect(text).toContain(
      "The command post website Error reports. When the command post website hits an error it does not handle, it sends Firebase Crashlytics a report: the kind of error, where in the website's code it happened, a Firebase error code or HTTP status if there is one, the website's version, your browser's user-agent string (the browser and system names and versions), and random session and installation numbers that Firebase keeps in your browser. The error's own message is removed in your browser before the report is sent, so an error report holds none of your text, photos, clips or join codes, and no account number. A visit with no such error sends no report. Error reports are kept for 30 days.",
    );
    const report = read("./telemetry/errorReport.ts");
    const wiring = read("./telemetry/crashReports.ts");
    const main = read("./main.tsx");
    // The message is always replaced; only the SDK's own code and status are added to it.
    expect(report).toContain('const parts = ["message removed"];');
    expect(report.match(/parts\.push\(/g)).toHaveLength(2);
    // Only these cleaned reports are sent, with no custom keys or user id, and the SDK loads on the first error.
    expect(report).toContain("captureUnhandledErrors: false");
    expect(report).not.toMatch(/customAttributes|setUserId|breadcrumbs/);
    expect(wiring).toContain('await import("firebase/crashlytics")');
    expect(`${main}\n${wiring}`).not.toMatch(/from "firebase\/crashlytics/);
  });

  // The policy's retention words must agree with the job that deletes drills (functions/src/retention.ts).
  it("says how long drill data is kept exactly as the retention job keeps it", () => {
    const md = read("../legal/privacy-policy.md");
    const job = read("../../functions/src/retention.ts");
    const days = Number(/DRILL_RETENTION_MS = (\d+) \* 86_400_000;/.exec(job)?.[1]);
    const text = markdownText(md);
    expect(text).toContain(`Drill data is deleted ${days} days after the search command closes the drill.`);
    const keep = /const KEEP_UNTIL[^{]*\{([^}]*)\}/.exec(job)?.[1] ?? "";
    // An entry may name a constant declared in the same file (const KEPT_UNTIL_MS = Date.UTC(2027, 0, 1)).
    const named = new Map([...job.matchAll(/const (\w+) = (Date\.UTC\([^)]*\));/g)].map((m) => [m[1]!, m[2]!] as const));
    const until = [...keep.matchAll(/:\s*([^,\n]+),/g)].map((m) => named.get(m[1]!.trim()) ?? m[1]!.trim());
    // The policy names four kept drills and the one date they are deleted on.
    expect(until).toHaveLength(4);
    expect(new Set(until)).toEqual(new Set(["Date.UTC(2027, 0, 1)"]));
    expect(text).toContain("The four drills we use for development, judging, testing and our film are deleted on January 1, 2027, or the next day if a step has to be retried.");
  });

  it("neither page carries draft or placeholder text", () => {
    for (const p of ["../privacy.html", "../support.html"]) expect(read(p), p).not.toMatch(/DRAFT|placeholder|\[publication date\]/i);
  });
});
