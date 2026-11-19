// The ring prior's distance columns (ISRID dementia, Lost Person Behavior p. 164). The sample sizes
// are the ones the shared source line states (terrains.test.ts checks them against it).

import { DEFAULT_PARAMS, type Terrain } from "@pls/engine";

export const TERRAINS: [Terrain, string][] = [
  ["urban", "Urban (suburb, town, big park)"],
  ["temperate_flat", "Temperate flat"],
  ["temperate_mountain", "Temperate mountain"],
];

export const RING_SAMPLE: Record<Terrain, number> = { urban: 336, temperate_flat: 175, temperate_mountain: 95 };

const COLUMN: Record<Terrain, string> = { urban: "Urban", temperate_flat: "Temperate flat", temperate_mountain: "Temperate mountain" };

/**
 * The source line for the column in use. ISRID is credited only while the incident's stored radii are the
 * sourced ones; radii stored differently are named as custom, with their values.
 */
export function ringSourceLine(t: Terrain, stored?: readonly number[]): string {
  const sourced = DEFAULT_PARAMS.rings[t];
  if (stored && (stored.length !== sourced.length || stored.some((v, i) => v !== sourced[i]))) {
    return `${COLUMN[t]} rings, custom radii (${stored.join(", ")} km), not the ISRID table, measured in a straight line.`;
  }
  return `${COLUMN[t]} rings, ISRID dementia (n = ${RING_SAMPLE[t]}), measured in a straight line.`;
}
