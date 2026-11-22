import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoAccessPanel } from "./NoAccessPanel";

// renderToString writes an apostrophe as &#x27;.
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]!.replaceAll("&#x27;", "'"));

describe("the no-access panel: a way back that never traps the browser", () => {
  it("on a drill, reopens the same drill or goes to the join form for another", () => {
    const html = renderToString(<NoAccessPanel line={null} practice="no" />);
    expect(buttons(html)).toEqual(["Reopen this drill", "Join another search"]);
    expect(html).toContain("Reopen this drill, or join another search with its code.");
  });

  it("on a practice search, points back to the judge's page only", () => {
    const html = renderToString(<NoAccessPanel line={null} practice="yes" />);
    expect(buttons(html)).toEqual(["Open the judge's page"]);
  });

  it("when the search's mode is only guessed from its id, offers both ways back", () => {
    const html = renderToString(<NoAccessPanel line="This browser is no longer signed in." practice="guess" />);
    expect(buttons(html)).toEqual(["Open the judge's page", "Reopen this drill", "Join another search"]);
    expect(html).toContain("This browser is no longer signed in.");
  });
});
