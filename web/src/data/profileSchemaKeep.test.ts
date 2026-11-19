// Every field of the shared profile, as the shared schema defines it, survives a command save of another field.
// A command save writes profile/shared whole from what the post read, so a field the reader does not keep is
// erased. This walks the schema, not a list kept here: a field added in shared/ fails until the web keeps it.
import { describe, expect, it } from "vitest";
import schema from "../../../shared/schemas/subject-profile.schema.json";
import { emptyProfile, mergeProfileSave, profileDocs } from "./profile";

type Schema = { type?: string; enum?: unknown[]; anyOf?: Schema[]; items?: Schema; properties?: Record<string, Schema>; required?: string[]; minimum?: number; pattern?: string };

/** A valid value for a schema that differs from what an empty profile holds, so a dropped field shows. */
function sample(s: Schema): unknown {
  if (s.anyOf) return sample(s.anyOf.find((b) => b.type !== "null")!);
  if (s.enum) return s.enum[s.enum.length > 1 ? 1 : 0];
  switch (s.type) {
    case "string":
      return s.pattern?.startsWith("^[0-9]{4}") ? "2026-11-01" : "Sample";
    case "integer":
    case "number":
      return s.minimum !== undefined && s.minimum > 0 ? s.minimum : 1;
    case "boolean":
      return true;
    case "array":
      return [sample(s.items ?? {})];
    case "object":
      return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, sample(v)]));
  }
  throw new Error(`no sample for ${JSON.stringify(s)}`);
}

const shared = (schema as unknown as { $defs: { SharedProfile: Schema } }).$defs.SharedProfile;
const props = Object.entries(shared.properties ?? {});
// approachNoteIds is worked out again from the merged profile on every save (it is not the family's data);
// gender is the field command edits in each case below.
const DERIVED = new Set(["approachNoteIds", "gender"]);

describe("a command save keeps every shared-profile field the schema defines", () => {
  it("walks the schema's SharedProfile", () => {
    expect(props.length).toBeGreaterThanOrEqual(22);
  });
  for (const [name, s] of props.filter(([n]) => !DERIVED.has(n))) {
    it(`keeps ${name}`, () => {
      const opened = emptyProfile();
      const stored = { ...profileDocs(opened).shared, [name]: sample(s) };
      const out = mergeProfileSave(opened, { ...opened, gender: "female" }, { shared: stored, command: null });
      expect((out.shared as Record<string, unknown>)[name]).toEqual(stored[name as keyof typeof stored]);
    });
  }
});
