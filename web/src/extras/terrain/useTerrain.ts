import { useEffect, useMemo, useState } from "react";
import type { IncidentView } from "../laneC";
import type { ExtrasMapLike } from "../types";
import { classifyTerrain, LEVEL_BAND_M, parseElevation, segmentAt, type ElevationFile, type TerrainClass } from "./classify";
import { attachTerrain } from "./terrainLayer";

/** The site's elevation file from the app's own origin, or null when this site has none. */
export async function fetchElevation(gridId: string): Promise<unknown> {
  const res = await fetch(`/extras/terrain/${encodeURIComponent(gridId)}.elevation.json`);
  // Hosting rewrites an unknown path to the app, so a missing file can arrive as HTML with status 200.
  if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null;
  return res.json();
}

/**
 * The terrain display layer for the command post's map: off by default, available only when the map is handed over
 * and this site's elevation file loads. Turning it on adds a layer and changes no number.
 */
export function useTerrain(view: IncidentView, map: unknown, load: (gridId: string) => Promise<unknown> = fetchElevation): {
  available: boolean;
  on: boolean;
  toggle(): void;
  file: ElevationFile | null;
  classes: Record<string, TerrainClass>;
  hasStart: boolean;
} {
  const gridId = view.incident?.gridId ?? null;
  const [file, setFile] = useState<ElevationFile | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    setFile(null);
    if (!gridId) return;
    let live = true;
    load(gridId).then(
      (json) => {
        if (!live || json === null || json === undefined) return;
        const r = parseElevation(json, gridId);
        setFile(r.ok ? r.file : null);
      },
      () => undefined, // no file for this site: the item stays disabled
    );
    return () => {
      live = false;
    };
  }, [gridId, load]);

  const ipp = view.incident?.ipp ?? null;
  const start = useMemo(() => (ipp ? segmentAt(view.segments, ipp) : null), [ipp, view.segments]);
  const classes = useMemo(
    () => (file ? classifyTerrain(file, start, LEVEL_BAND_M, view.segments.map((s) => s.segmentId)) : {}),
    [file, start, view.segments],
  );
  const available = Boolean(map && file);

  useEffect(() => {
    if (!on || !map || !file) return;
    const layer = attachTerrain(map as ExtrasMapLike);
    layer.set(classes, view.segments);
    // After the map itself is removed, its sources and layers are gone and remove() finds nothing to take away.
    return () => layer.remove();
  }, [on, map, file, classes, view.segments]);

  return { available, on: on && available, toggle: () => setOn((x) => !x), file, classes, hasStart: start !== null };
}
