// Build plugin: copies each grid's basemap tiles and route graph from shared/grid (where the grid builder commits
// them, with their provenance and licence) into the build at tiles/, and serves the same files in dev. A missing
// file fails the build, so a deploy can never go out without its map; hosting answers a missing tile with 404.

import type { Plugin } from "vite";

type GridFilesDeps = {
  gridIds: readonly string[];
  /** The bytes of a file in shared/grid, or null when it is not there. */
  read: (name: string) => Uint8Array | null;
};

const filesFor = (gridId: string) => [`${gridId}.pmtiles`, `${gridId}.graph.json`];

export function gridFilesPlugin(deps: GridFilesDeps): Plugin {
  return {
    name: "pls-grid-files",
    generateBundle() {
      for (const name of deps.gridIds.flatMap(filesFor)) {
        const source = deps.read(name);
        if (!source) throw new Error(`shared/grid/${name} is missing: the build needs every grid's tiles and route graph`);
        this.emitFile({ type: "asset", fileName: `tiles/${name}`, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0]?.replace(/^\/tiles\//, "");
        if (!req.url?.startsWith("/tiles/") || !name || !deps.gridIds.flatMap(filesFor).includes(name)) return next();
        const source = deps.read(name);
        if (!source) return next();
        res.setHeader("content-type", name.endsWith(".json") ? "application/json" : "application/octet-stream");
        res.end(Buffer.from(source));
      });
    },
  };
}
