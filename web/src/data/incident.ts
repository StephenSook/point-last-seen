// Live reads of one incident for the command post: the incident doc, teams,
// segments and each phone's clock offset (measured when it packed).

import { collection, doc, onSnapshot, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { EngineParams, GridSegment, PriorLayers, Terrain } from "@pls/engine";
import type { MapSegment } from "../map/poaStyle";

export type IncidentDoc = {
  name: string;
  mode: "drill" | "judge";
  drillLabel?: string;
  status: "open" | "found" | "closed";
  priorVersion: number;
  priorInputEventIds?: string[];
  engineParams?: EngineParams;
  ipp?: { lat: number; lon: number };
  gridId?: string;
  /** The license line the grid builder stamps on the incident, shown wherever its segments draw. */
  gridAttribution?: string;
  /** Which ISRID distance column the prior uses; flat or mountain for this site is not verified. */
  terrain?: Terrain;
  /** The prior's switchable layers (rings are always on). */
  priorLayers?: PriorLayers;
  /** Which prior the segments carry; the ring prior is always kept in ringPoa. */
  priorModel?: "rings" | "walkers";
  /** The walker run's seed, so a rerun gives the identical table. */
  priorSeed?: number;
};

export type Team = { teamId: string; name: string };
export type SegmentDoc = MapSegment & {
  areaM2: number;
  priorPoa: number;
  neighbors: string[];
  upstream: string[];
  downstream: string[];
  /** Share of the cell within 71 m of a road, trail, stream or water edge (the linear layer reads it; absent: 0). */
  nearFrac?: number;
  featureClasses?: GridSegment["featureClasses"];
};

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type IncidentView = {
  incident: IncidentDoc | null;
  teams: Team[];
  segments: SegmentDoc[];
  /** Prior mass outside the grid: the reserved "ROW" segment. Null until the prior is built. */
  rowPrior: number | null;
  clockOffsets: Record<string, number>;
};

function parseGeometry(json: unknown): MapSegment["geometry"] | null {
  try {
    const g = typeof json === "string" ? JSON.parse(json) : json;
    return g && (g.type === "Polygon" || g.type === "MultiPolygon") ? g : null;
  } catch {
    return null;
  }
}

export function subscribeIncident(
  db: Firestore,
  incidentId: string,
  onChange: (v: IncidentView) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  const view: IncidentView = { incident: null, teams: [], segments: [], rowPrior: null, clockOffsets: {} };
  const emit = () => onChange({ ...view, teams: [...view.teams], segments: [...view.segments], clockOffsets: { ...view.clockOffsets } });
  const deviceUnsubs = new Map<string, Unsubscribe>();
  const base = ["incidents", incidentId] as const;

  const unsubs: Unsubscribe[] = [
    onSnapshot(doc(db, ...base), (s) => {
      view.incident = s.exists() ? (s.data() as IncidentDoc) : null;
      emit();
    }, onError),
    onSnapshot(collection(db, ...base, "segments"), (s) => {
      const row = s.docs.find((d) => d.id === "ROW")?.data()["priorPoa"];
      view.rowPrior = typeof row === "number" ? row : null;
      view.segments = s.docs.flatMap((d) => {
        if (d.id === "ROW") return [];
        const data = d.data();
        const geometry = parseGeometry(data["geometryJson"]);
        return geometry
          ? [
              {
                segmentId: d.id, geometry, centroid: data["centroid"], areaM2: data["areaM2"], priorPoa: data["priorPoa"],
                neighbors: ids(data["neighbors"]), upstream: ids(data["upstream"]), downstream: ids(data["downstream"]),
                nearFrac: typeof data["nearFrac"] === "number" ? data["nearFrac"] : 0,
                featureClasses: ids(data["featureClasses"]) as SegmentDoc["featureClasses"],
              } as SegmentDoc,
            ]
          : [];
      });
      emit();
    }, onError),
    onSnapshot(collection(db, ...base, "teams"), (s) => {
      view.teams = s.docs.map((d) => ({ teamId: d.id, name: String(d.data()["name"] ?? d.id) }));
      for (const t of view.teams) {
        if (deviceUnsubs.has(t.teamId)) continue;
        deviceUnsubs.set(t.teamId, onSnapshot(collection(db, ...base, "teams", t.teamId, "devices"), (ds) => {
          for (const d of ds.docs) {
            const off = d.data()["clockOffsetMs"];
            if (typeof off === "number") view.clockOffsets[d.id] = off;
          }
          emit();
        }, onError));
      }
      emit();
    }, onError),
  ];
  return () => {
    for (const u of unsubs) u();
    for (const u of deviceUnsubs.values()) u();
  };
}
