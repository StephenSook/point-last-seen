import { area } from "@turf/area";
import { bearing } from "@turf/bearing";
import { circle } from "@turf/circle";
import { difference } from "@turf/difference";
import { featureCollection, point, polygon } from "@turf/helpers";
import { intersect } from "@turf/intersect";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { DEFAULT_PARAMS, ELEVATION_PARAMS } from "./params";
import type { EngineParams, Grid, LatLon, SegmentPrior, Terrain } from "./types";

const RING_STEPS = 128;

export interface PriorLayers {
  /** ISRID track offset: 75% within 71 m of a road, trail, stream or water edge. */
  linear: boolean;
  /** ISRID dispersion: 75% within 66 degrees of the travel direction. Needs a travel bearing. */
  wedge: boolean;
  /** ISRID elevation change from the IPP (p.164): 19% uphill, 39% level, 42% downhill. Needs segment elevations. */
  elevation?: boolean;
}

/** Each segment's elevation in metres and the start's, for the elevation layer (from the site's elevation file). */
export interface SegmentElevations {
  startM: number;
  bySegment: Readonly<Record<string, number>>;
}

export interface PriorResult {
  segments: SegmentPrior[];
  /** Mass outside the grid, shown as "outside the mapped area". */
  row: number;
}

function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/**
 * Linear-feature weights (spec 10.5): 0.75 x nearFrac / NEAR + 0.25 x (1 - nearFrac) / (1 - NEAR), where NEAR
 * is the grid's mass-weighted near share. Neutral (all 1) when NEAR is at or above nearShare (review
 * ruling 2026-11-18): the layer's intent is to raise density near features to the ISRID 75%, and above that
 * share the formula would instead push mass into the tiny far area. Continuous at the threshold, where the
 * formula already gives 1 for every segment. Also neutral when there is no mass or nothing is near.
 */
export function linearWeights(mass: number[], nearFrac: number[], nearShare: number, farShare: number): number[] {
  const total = mass.reduce((n, v) => n + v, 0);
  const near = total > 0 ? mass.reduce((n, v, j) => n + v * nearFrac[j]!, 0) / total : 0;
  if (near <= 0 || near >= nearShare) return mass.map(() => 1);
  return nearFrac.map(f => (nearShare * f) / near + (farShare * (1 - f)) / (1 - near));
}

/**
 * Elevation weights (Koester, Lost Person Behavior, dementia p.164): each segment classed uphill (more than levelBandM
 * above the start), level (within levelBandM) or downhill, then weighted so the classes hold their shares of the
 * classified mass. A class with no mass gives its share back pro rata; a segment with no elevation (null) keeps
 * weight 1; with no mass or one class only, nothing changes. levelBandM is ours: the source defines no band.
 */
export function elevationWeights(mass: number[], relativeM: (number | null)[], shares: { up: number; level: number; down: number },
  levelBandM: number): number[] {
  const cls = relativeM.map(r => (r === null ? null : r > levelBandM ? "up" : r < -levelBandM ? "down" : "level"));
  const classMass = { up: 0, level: 0, down: 0 };
  cls.forEach((c, j) => { if (c) classMass[c] += mass[j]!; });
  const total = classMass.up + classMass.level + classMass.down;
  const present = (["up", "level", "down"] as const).filter(c => classMass[c] > 0);
  if (total <= 0 || present.length <= 1) return mass.map(() => 1);
  const shareSum = present.reduce((n, c) => n + shares[c], 0);
  return cls.map(c => (c === null || classMass[c] <= 0 ? 1 : ((shares[c] / shareSum) * total) / classMass[c]));
}

function rescale(values: number[], targetSum: number): number[] {
  const s = values.reduce((n, v) => n + v, 0);
  return s > 0 ? values.map(v => (v * targetSum) / s) : values;
}

/**
 * The ISRID ring prior (spec section 10.5), TypeScript only. Ring layer: a segment's mass is, for each
 * annulus, the ring mass times the share of the annulus area that the segment covers; ROW is the rest
 * (0.05 beyond the last ring plus whatever falls outside the grid). Then, when switched on, the linear
 * layer moves the grid's mass so that 75% sits near features, and the wedge layer weights segments by
 * direction (2.045 inside 66 degrees of the travel bearing, 0.395 outside); both keep the grid's mass. Last, the
 * elevation layer, when on, sets the grid's uphill, level and downhill shares (it needs segment elevations and
 * refuses urban terrain, which the source gives no split for); it keeps the grid's mass too.
 */
export function buildPrior(
  grid: Grid, ipp: LatLon, terrain: Terrain, layers: PriorLayers, travelBearingDeg: number | null,
  params: EngineParams = DEFAULT_PARAMS, elevations?: SegmentElevations,
): PriorResult {
  if (layers.elevation) {
    if (terrain === "urban") throw new Error("The elevation layer has no urban split in its source, so it is not used on urban terrain");
    if (!elevations) throw new Error("The elevation layer needs this site's segment elevations");
  }
  const radiiKm = params.rings[terrain];
  const masses = params.rings.masses;
  // Each ring's share of the mass: at least one, each finite and not negative, adding up to more than 0 and at most 1
  // (ROW takes the rest). An empty list would put all the mass outside the rings.
  const massesUsable = Array.isArray(masses) && masses.length > 0 && masses.every(m => Number.isFinite(m) && m >= 0)
    && (() => { const sum = masses.reduce((a, m) => a + m, 0); return sum > 0 && sum <= 1 + 1e-9; })();
  if (!massesUsable) throw new Error("The ring masses in these engine params are not shares adding up to more than 0 and at most 1");
  if (!Array.isArray(radiiKm)) throw new Error(`No distance rings for terrain "${terrain}" in these engine params`);
  // One radius per ring mass, each finite, positive and larger than the last, or the prior would be meaningless.
  const usable = radiiKm.length === masses.length
    && radiiKm.every((r, i) => Number.isFinite(r) && r > 0 && (i === 0 || r > radiiKm[i - 1]!));
  if (!usable) throw new Error(`The distance rings for terrain "${terrain}" are not ${masses.length} increasing positive radii`);
  const center = point([ipp.lon, ipp.lat]);
  const circles = radiiKm.map(r => circle(center, r, { steps: RING_STEPS, units: "kilometers" }));
  const annuli: (Feature<Polygon | MultiPolygon> | null)[] = circles.map((c, k) =>
    k === 0 ? c : difference(featureCollection([c, circles[k - 1]!])));
  const annulusArea = annuli.map(a => (a ? area(a) : 0));

  let mass = grid.segments.map(seg => {
    const cellPoly = polygon(seg.geometry.coordinates);
    let m = 0;
    annuli.forEach((a, k) => {
      if (!a || annulusArea[k]! <= 0) return;
      const overlap = intersect(featureCollection([cellPoly, a]));
      if (overlap) m += (masses[k]! * area(overlap)) / annulusArea[k]!;
    });
    return m;
  });
  const gridMass = mass.reduce((n, v) => n + v, 0);

  if (layers.linear) {
    const { nearShare, farShare } = params.nearFeature;
    const w = linearWeights(mass, grid.segments.map(s => s.nearFrac), nearShare, farShare);
    if (w.some(x => x !== 1)) mass = rescale(mass.map((v, j) => v * w[j]!), gridMass);
  }

  if (layers.wedge && travelBearingDeg !== null) {
    const { halfAngleDeg, inside, outside } = params.wedge;
    mass = rescale(mass.map((v, j) => {
      const c = grid.segments[j]!.centroid;
      const b = (bearing(center, point([c.lon, c.lat])) + 360) % 360;
      return v * (angleBetween(b, travelBearingDeg) <= halfAngleDeg ? inside : outside);
    }), gridMass);
  }

  if (layers.elevation && elevations) {
    const { levelBandM, temperate } = ELEVATION_PARAMS;
    const rel = grid.segments.map(s => {
      const m = elevations.bySegment[s.segmentId];
      return typeof m === "number" && Number.isFinite(m) ? m - elevations.startM : null;
    });
    const w = elevationWeights(mass, rel, temperate, levelBandM);
    if (w.some(x => x !== 1)) mass = rescale(mass.map((v, j) => v * w[j]!), gridMass);
  }

  const segments = grid.segments.map((s, j) => ({ segmentId: s.segmentId, priorPoa: mass[j]! }));
  return { segments, row: 1 - segments.reduce((n, s) => n + s.priorPoa, 0) };
}
