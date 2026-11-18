import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { bbox } from "@turf/bbox";
import type { Grid } from "@pls/engine";
import type { Feature, Geometry, LineString, Polygon, Position } from "geojson";
import { buildCells } from "./cells";
import { applyFeatures, classifyOsm } from "./features";
import { applyStreams } from "./streams";

/** The subset of Overpass `out geom` JSON the builder reads. */
interface OsmPoint { lat: number; lon: number }
interface OsmMember { type: string; role?: string; geometry?: OsmPoint[] }
interface OsmElement {
  type: string; id: number; tags?: Record<string, string>; lat?: number; lon?: number; geometry?: OsmPoint[]; members?: OsmMember[];
}
export interface OverpassJson { elements: OsmElement[] }

const USAGE = "usage: build-grid <site.geojson> <gridId> --osm <overpass.json> --out <grid.json>\n"
  + "       build-grid --query <site.geojson>   (prints the Overpass query for the site's bounding box)";

const coords = (pts: OsmPoint[]): Position[] => pts.map(p => [p.lon, p.lat]);
const closed = (c: Position[]) => c.length >= 4 && c[0]![0] === c[c.length - 1]![0] && c[0]![1] === c[c.length - 1]![1];

/**
 * Grid features from Overpass JSON: each classified way becomes a LineString, or a Polygon when it is closed
 * water or a building; a multipolygon relation contributes its closed outer members. Waterway lines are also
 * returned as `streams`, in OSM way order, which is the flow direction.
 */
export function osmToFeatures(osm: OverpassJson): { features: Feature<Geometry>[]; streams: Feature<LineString>[] } {
  const features: Feature<Geometry>[] = [], streams: Feature<LineString>[] = [];
  for (const el of osm.elements) {
    const cls = el.tags ? classifyOsm(el.tags) : null;
    if (!cls) continue;
    const props = { class: cls, osm: `${el.type}/${el.id}` };
    if (el.type === "way" && el.geometry && el.geometry.length >= 2) {
      const c = coords(el.geometry);
      if ((cls === "water" || cls === "structure") && closed(c)) {
        features.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [c] } as Polygon });
      } else {
        const f: Feature<LineString> = { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: c } };
        features.push(f);
        if (cls === "stream") streams.push(f);
      }
    } else if (el.type === "relation" && el.members) {
      for (const m of el.members) {
        if (m.role !== "outer" || !m.geometry) continue;
        const c = coords(m.geometry);
        if (closed(c)) features.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [c] } as Polygon });
      }
    }
  }
  return { features, streams };
}

/** Cells, then near-feature fractions, then stream links. Same inputs, same output. */
export function buildGrid(site: Feature<Polygon>, gridId: string, osm: OverpassJson): Grid {
  const { features, streams } = osmToFeatures(osm);
  return applyStreams(applyFeatures(buildCells(site, gridId), features), streams);
}

/** The Overpass QL query for the site's bounding box: the four tag families the grid classes come from. */
export function overpassQuery(box: [number, number, number, number]): string {
  const [w, s, e, n] = box;
  const b = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:60];\n(\n${["highway", "waterway", "natural", "building"]
    .map(k => `  way["${k}"]${b};\n  relation["${k}"]${b};`).join("\n")}\n);\nout geom;\n`;
}

function siteOf(path: string): Feature<Polygon> {
  const j = JSON.parse(readFileSync(path, "utf8"));
  const f: Feature<Polygon> = j.type === "FeatureCollection" ? j.features[0] : j;
  if (!f || f.geometry?.type !== "Polygon") throw new Error(`${path}: expected one Polygon feature`);
  return f;
}

export function main(argv: string[]): number {
  const flag = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const query = flag("--query");
  if (query) {
    process.stdout.write(overpassQuery(bbox(siteOf(query)) as [number, number, number, number]));
    return 0;
  }
  const positional = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1]!.startsWith("--")));
  const [sitePath, gridId] = positional;
  const osmPath = flag("--osm"), out = flag("--out");
  if (!sitePath || !gridId || !osmPath || !out) {
    process.stderr.write(USAGE + "\n");
    return 2;
  }
  const grid = buildGrid(siteOf(sitePath), gridId, JSON.parse(readFileSync(osmPath, "utf8")) as OverpassJson);
  writeFileSync(out, JSON.stringify(grid, null, 2) + "\n");
  process.stdout.write(`build-grid: ${grid.segments.length} segments written to ${out}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv.slice(2)));
