// The self-hosted basemap: one PMTiles file per site, fetched whole (a small site
// extract), so the service worker can keep it as an ordinary response and the map
// draws its streets and water offline. Nothing is read from a third-party host.

import { FileSource, PMTiles } from "pmtiles";

const MAGIC = "PMTiles";

export type Basemap =
  | { state: "ok"; key: string; tiles: PMTiles }
  | { state: "absent" }
  | { state: "invalid" }
  | { state: "unavailable" };

export async function loadBasemap(url: string, fetchFn: (url: string) => Promise<Response> = fetch): Promise<Basemap> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    return { state: "unavailable" };
  }
  // Hosting rewrites unknown paths to the app, so a missing file can arrive as HTML with status 200.
  if (res.status === 404 || (res.headers.get("content-type") ?? "").includes("text/html")) return { state: "absent" };
  if (!res.ok) return { state: "unavailable" };
  const bytes = new Uint8Array(await res.arrayBuffer());
  const magic = String.fromCharCode(...bytes.slice(0, 7));
  if (magic !== MAGIC || bytes[7] !== 3) return { state: "invalid" };
  // FileSource keys tiles by the file's name, so "pmtiles://<name>" finds them.
  const name = url.split("/").pop() || url;
  const tiles = new PMTiles(new FileSource(new File([bytes], name)));
  return { state: "ok", key: name, tiles };
}
