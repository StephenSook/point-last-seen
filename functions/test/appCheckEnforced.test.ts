import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as index from "../src/index";
import { callRaw } from "./callable";

// Every client-callable function, found from the deployed exports: a v2 callable's endpoint carries callableTrigger.
const callables = Object.entries(index)
  .filter(([, v]) => (v as { __endpoint?: { callableTrigger?: unknown } }).__endpoint?.callableTrigger !== undefined)
  .map(([name]) => name)
  .sort();

describe("every client-callable function enforces App Check", () => {
  it("finds the callables from the exports", () => {
    expect(callables).toEqual(["deleteIncidentMediaNow", "deleteMyAccount", "joinIncident", "removeMember", "rotateJoinCode", "startJudgeSession"]);
  });

  it.each(callables)("%s refuses a call with no App Check token, or a bad one, before its handler runs", async name => {
    const fn = (index as Record<string, unknown>)[name];
    for (const appCheck of [undefined, "not-an-app-check-token"]) {
      const res = await callRaw({ method: "POST", appCheck, fn, body: { data: {} } });
      expect(res.status).toBe(401);
      // The wrapper's App Check refusal; every handler's own refusal says "Sign in before ...".
      expect(JSON.stringify(res.body)).toContain('"message":"Unauthenticated"');
    }
  });

  it("control: without enforcement the same request reaches the handler, which answers in its own words", async () => {
    const unenforced = onCall({ enforceAppCheck: false }, () => { throw new HttpsError("unauthenticated", "Sign in before this."); });
    const res = await callRaw({ method: "POST", fn: unenforced, body: { data: {} } });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toContain("Sign in before this.");
    expect(JSON.stringify(res.body)).not.toContain('"message":"Unauthenticated"');
  });

  it("docs/SECURITY.md row 14 names every callable and gives the right count", () => {
    const row = readFileSync(new URL("../../docs/SECURITY.md", import.meta.url), "utf8").split("\n").find(l => l.startsWith("| 14 |"));
    expect(row, "row 14").toBeDefined();
    for (const name of callables) expect(row, name).toContain(`\`${name}\``);
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    expect(row).toContain(`all ${words[callables.length]} client-callable functions`);
  });
});
