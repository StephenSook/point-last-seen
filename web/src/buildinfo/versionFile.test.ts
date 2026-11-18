import { describe, expect, it } from "vitest";
import { versionFilePlugin } from "./versionFile";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function emitted(plugin: ReturnType<typeof versionFilePlugin>) {
  const files: { fileName: string; source: string }[] = [];
  const hook = plugin.generateBundle as unknown as (this: unknown) => void;
  hook.call({ emitFile: (f: { fileName: string; source: string }) => files.push(f) });
  return files;
}

describe("versionFilePlugin", () => {
  it("writes version.json with the commit, the dirty flag and the build time", () => {
    const files = emitted(versionFilePlugin({ sha: () => SHA, dirty: () => false, now: () => new Date("2026-11-20T12:00:00Z") }));
    expect(files).toHaveLength(1);
    expect(files[0]!.fileName).toBe("version.json");
    expect(JSON.parse(files[0]!.source)).toEqual({ commit: SHA, dirty: false, builtAt: "2026-11-20T12:00:00.000Z" });
  });

  it("records a build from a dirty tree as dirty", () => {
    const files = emitted(versionFilePlugin({ sha: () => SHA, dirty: () => true, now: () => new Date(0) }));
    expect(JSON.parse(files[0]!.source).dirty).toBe(true);
  });

  it("fails the build when there is no full commit SHA", () => {
    expect(() => emitted(versionFilePlugin({ sha: () => "", dirty: () => false, now: () => new Date(0) }))).toThrow(/commit/);
    expect(() => emitted(versionFilePlugin({ sha: () => "abc123", dirty: () => false, now: () => new Date(0) }))).toThrow(/commit/);
  });
});
