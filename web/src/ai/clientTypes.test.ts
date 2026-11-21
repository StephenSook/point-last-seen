import { expect, it } from "vitest";
import type { ReplySource } from "./client";

// Checked by the typechecker: a misspelt source must not compile, so a branch on "on-device" can never be written.
it("a reply's source is the SDK's own type: a misspelt source does not compile", () => {
  // @ts-expect-error "on-device" is not one of the SDK's sources ("on_device" or "in_cloud").
  const misspelt: ReplySource = "on-device";
  const sources: ReplySource[] = ["on_device", "in_cloud", undefined];
  expect([misspelt, ...sources]).toHaveLength(4);
});
