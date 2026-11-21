// The elevation layer's input: each segment's mean elevation from the site's elevation file (the same file the
// terrain display reads). Null when the site has none, or the file is for another grid or cannot be read, so the
// command post shows no elevation switch there.

import { parseElevation } from "../extras/terrain/classify";
import { fetchElevation } from "../extras/terrain/useTerrain";

export async function loadElevationM(gridId: string, load: (gridId: string) => Promise<unknown> = fetchElevation): Promise<Record<string, number> | null> {
  try {
    const json = await load(gridId);
    if (json === null) return null;
    const r = parseElevation(json, gridId);
    return r.ok ? Object.fromEntries(Object.entries(r.file.cells).map(([id, c]) => [id, c.meanM])) : null;
  } catch {
    return null;
  }
}
