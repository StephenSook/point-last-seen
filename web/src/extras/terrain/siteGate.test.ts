/// <reference types="node" />

// Gate G-TERR-2 on the shipped data: a site's elevation file ships only if the grid's stream links (OpenStreetMap
// stream direction) mostly run downhill in it. Every file under web/public/extras/terrain is checked on every run,
// so a file that fails the gate cannot ship. With no file, the Terrain item stays disabled for that site.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parseElevation, streamDownhillCheck, streamGate } from "./classify";

const terrainDir = fileURLToPath(new URL("../../../public/extras/terrain/", import.meta.url));
const gridDir = fileURLToPath(new URL("../../../../shared/grid/", import.meta.url));
const files = existsSync(terrainDir) ? readdirSync(terrainDir).filter((f) => f.endsWith(".elevation.json")) : [];

it("every shipped site elevation file is checked against its grid (one site ships: the Kennesaw drill grid)", () => {
  // Raise this when another site passes and its file ships; the walk must then find it.
  expect(files).toEqual(["kennesaw-mountain-drill.elevation.json"]);
});

for (const name of files) {
  it(`${name}: at most 20 percent of stream links run uphill (G-TERR-2)`, () => {
    const json: unknown = JSON.parse(readFileSync(terrainDir + name, "utf8"));
    const gridId = name.replace(/\.elevation\.json$/, "");
    const parsed = parseElevation(json, gridId);
    if (!parsed.ok) throw new Error(parsed.reason);
    const grid = JSON.parse(readFileSync(`${gridDir}${gridId}.grid.json`, "utf8")) as { segments: { segmentId: string; downstream: string[] }[] };
    const r = streamDownhillCheck(parsed.file, grid.segments);
    expect({ gridId, ...r, ...streamGate(r) }).toMatchObject({ pass: true });
  });
}
