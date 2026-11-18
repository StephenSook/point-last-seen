// The repo's storage.lifecycle.json is the exact rule the live health check (ops/storage) demands, so the file
// that is applied to the bucket and the check the daily probe reads cannot drift apart.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lifecycleOk } from "../src/media";

const file = JSON.parse(readFileSync(new URL("../../storage.lifecycle.json", import.meta.url), "utf8"));

describe("storage.lifecycle.json", () => {
  it("deletes clips/, photos/ and packs/ at 30 days, and passes the health check's exact rule", () => {
    expect(lifecycleOk({ lifecycle: file })).toEqual({ ok: true, ageDays: 30 });
  });
  it("control: the same check refuses the file with its age changed", () => {
    const changed = { rule: file.rule.map((r: { condition: object }) => ({ ...r, condition: { ...r.condition, age: 31 } })) };
    expect(lifecycleOk({ lifecycle: changed }).ok).toBe(false);
  });
});
