import type { JSX } from "react";
import { ISRID_ELEVATION, LEVEL_BAND_M, type ElevationFile, type TerrainClass } from "./classify";

function Chevron({ up }: { up: boolean }) {
  return (
    <svg className="extras-terrain-chevron" viewBox="0 0 18 18" width="14" height="14" aria-hidden="true">
      <path d={up ? "M4 12 L9 6 L14 12" : "M4 6 L9 12 L14 6"} />
    </svg>
  );
}

/** Shown only while the terrain layer is on. Every line says what the marks are and what they are not. */
export function TerrainLegend({ classes, file, hasStart }: { classes: Record<string, TerrainClass>; file: ElevationFile; hasStart: boolean }): JSX.Element {
  const values = Object.values(classes);
  const allLevel = hasStart && values.length > 0 && values.every((c) => c === "level" || c === "no_data") && values.some((c) => c === "level");
  return (
    <aside className="extras-terrain-legend" aria-label="Terrain legend">
      {!hasStart && <p>No start point is set, so no ground is marked.</p>}
      {allLevel && <p>This site is about level. No higher or lower ground to show.</p>}
      {hasStart && !allLevel && (
        <p>
          <Chevron up={false} /> Lower than the start. <Chevron up /> Higher than the start. About level (within {LEVEL_BAND_M} m; our band).
        </p>
      )}
      <p>{`ISRID dementia profile (temperate): found downhill ${ISRID_ELEVATION.downhillPct}%, uphill ${ISRID_ELEVATION.uphillPct}%, same ${ISRID_ELEVATION.samePct}%.`}</p>
      <p className="muted small">{`Elevation: ${file.credit}. Display only. The prior has no elevation term.`}</p>
    </aside>
  );
}
