import type { SegmentDoc, ViewState } from "../laneC";
import { DRILL_LABEL, type PrintModel, type PrintTeam } from "../print/printModel";

export type ExportInput = {
  model: PrintModel; segments: readonly SegmentDoc[]; vs: ViewState; rowPoa: number | null; exportedAtMs: number;
};
export type GeoJsonText = { type: "FeatureCollection"; features: unknown[]; pls: Record<string, unknown> };

function twiceSignedArea(ring: readonly number[][]): number {
  const origin = ring[0];
  if (!origin) return 0;
  const [x0, y0] = origin as [number, number];
  let area = 0;
  // Use the first point as the origin to avoid cancellation on small polygons.
  for (let index = 1; index + 1 < ring.length; index++) {
    const [x1, y1] = ring[index] as [number, number];
    const [x2, y2] = ring[index + 1] as [number, number];
    area += (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  }
  return area;
}

export function ringIsCounterClockwise(ring: readonly number[][]): boolean {
  return twiceSignedArea(ring) > 0;
}

export function round6(n: number): number {
  return Number(n.toFixed(6));
}

export function rewind(coords: number[][][]): number[][][] {
  if (coords.length === 0) throw new Error("Missing polygon rings.");
  return coords.map((ring, index) => {
    const positions = ring.map(([lon, lat]) => {
      if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)
        || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new Error("Invalid segment position.");
      return [round6(lon), round6(lat)];
    });
    const start = positions[0];
    const end = positions.at(-1);
    if (!start || !end || positions.length < 3 || twiceSignedArea(positions) === 0) {
      throw new Error("Invalid segment ring.");
    }
    if (start[0] !== end[0] || start[1] !== end[1]) positions.push([...start]);
    if (ringIsCounterClockwise(positions) !== (index === 0)) positions.reverse();
    return positions;
  });
}

function segmentGeometry(geometry: SegmentDoc["geometry"]): SegmentDoc["geometry"] {
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: rewind(geometry.coordinates) }
    : { type: "MultiPolygon", coordinates: geometry.coordinates.map(rewind) };
}

export function segmentsToGeoJson({ model, segments, vs, rowPoa, exportedAtMs }: ExportInput): GeoJsonText {
  const ranks = new Map(vs.rank.map(({ segmentId, rank }) => [segmentId, rank]));
  const assignments = new Map<string, PrintTeam>();
  for (const team of model.teams) {
    for (const id of team.segmentIds) {
      if (!assignments.has(id)) assignments.set(id, team);
    }
  }
  const features = segments.filter(({ segmentId }) => segmentId !== "ROW").map((segment) => {
    const { segmentId, areaM2, priorPoa } = segment;
    const team = assignments.get(segmentId);
    return {
      type: "Feature",
      geometry: segmentGeometry(segment.geometry),
      properties: {
        segmentId, areaM2, priorPoa,
        poa: vs.result.poa[segmentId] ?? 0,
        cumulativePod: vs.result.cumulativePod[segmentId] ?? 0,
        rank: ranks.get(segmentId) ?? null,
        teamId: team?.teamId ?? null,
        teamName: team?.name ?? null,
        taskText: team?.taskText ?? null,
        planVersion: model.planVersion,
      },
    };
  });
  return {
    type: "FeatureCollection",
    features,
    pls: {
      incidentName: model.incidentName,
      mode: model.mode,
      drillLabel: model.mode === "drill" ? DRILL_LABEL : null,
      planVersion: model.planVersion,
      eventSetHash: vs.hash,
      matchCode: model.matchCode,
      outsideMappedAreaPoa: rowPoa,
      exportedAt: new Date(exportedAtMs).toISOString(),
      attribution: "Map data from OpenStreetMap",
      note: "POA is a planning aid. It does not say where a person is.",
    },
  };
}

export function exportFileName(incidentName: string, planVersion: number | null, exportedAtMs: number): string {
  const slug = incidentName.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "incident";
  const plan = planVersion === null ? "" : `-plan-v${planVersion}`;
  const stamp = new Date(exportedAtMs).toISOString().slice(0, 16).replace(/[-:]/g, "");
  return `pls-${slug}${plan}-${stamp}Z.geojson`;
}
