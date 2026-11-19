import { describe, expect, it } from "vitest";
import { gridFilesPlugin } from "./gridFiles";

function emitted(plugin: ReturnType<typeof gridFilesPlugin>) {
  const files: { fileName: string; source: Uint8Array }[] = [];
  const hook = plugin.generateBundle as unknown as (this: unknown) => void;
  hook.call({ emitFile: (f: { fileName: string; source: Uint8Array }) => files.push(f) });
  return files;
}

const store: Record<string, Uint8Array> = {
  "site-a.pmtiles": new Uint8Array([1, 2]),
  "site-a.graph.json": new Uint8Array([3]),
};

describe("gridFilesPlugin", () => {
  it("puts each grid's basemap tiles and route graph under tiles/ in the build", () => {
    const files = emitted(gridFilesPlugin({ gridIds: ["site-a"], read: (name) => store[name] ?? null }));
    expect(files.map((f) => f.fileName).sort()).toEqual(["tiles/site-a.graph.json", "tiles/site-a.pmtiles"]);
    expect(files.find((f) => f.fileName === "tiles/site-a.pmtiles")!.source).toEqual(new Uint8Array([1, 2]));
  });
  it("fails the build when a grid file is missing, so a deploy can never go out without its map", () => {
    expect(() => emitted(gridFilesPlugin({ gridIds: ["site-b"], read: () => null }))).toThrow(/site-b\.pmtiles/);
  });
});
