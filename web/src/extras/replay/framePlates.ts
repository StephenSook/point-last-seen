import { formatPct, type MapSegment } from "../laneC";

/** One segment as a frame draws it: its percent plate and where the plate sits. */
export type FramePlate = { segmentId: string; label: string; lat: number; lon: number };

/**
 * The plates a frame hands to the map, one per segment, sorted by segment id. A check can then pair each percent
 * with its segment and place, which the plates' text alone cannot do.
 */
export function framePlates(segments: readonly MapSegment[], poa: Readonly<Record<string, number>>): FramePlate[] {
  return segments
    .map((s) => ({ segmentId: s.segmentId, label: formatPct(poa[s.segmentId] ?? 0), lat: s.centroid.lat, lon: s.centroid.lon }))
    .sort((a, b) => (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0));
}
