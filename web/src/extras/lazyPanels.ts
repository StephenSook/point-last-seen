// The extras panels load on first use, so the command post's first load grows by the dock button only. Each
// loader is also called once the page is idle (prefetch), so a panel still opens after the link drops.

import { lazy } from "react";

const load = {
  print: () => import("./print/PrintSession"),
  replay: () => import("./replay/ReplayPanel"),
  check: () => import("./radio/RadioCodeCheck"),
  cube: () => import("./cube/SpaceTimeCube"),
  scam: () => import("./scam/ScamPanel"),
  geojson: () => import("./export/geojsonExport"),
};

/** The GeoJSON writer, loaded on the first export. */
export const loadGeoJsonExport = load.geojson;

export const LazyPrintSession = lazy(() => load.print().then((m) => ({ default: m.PrintSession })));
export const LazyReplayPanel = lazy(() => load.replay().then((m) => ({ default: m.ReplayPanel })));
export const LazyRadioCodeCheck = lazy(() => load.check().then((m) => ({ default: m.RadioCodeCheck })));
export const LazySpaceTimeCube = lazy(() => load.cube().then((m) => ({ default: m.SpaceTimeCube })));
export const LazyScamPanel = lazy(() => load.scam().then((m) => ({ default: m.ScamPanel })));

function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 200);
  return () => clearTimeout(id);
}

// A failed prefetch (link already down) is retried by React.lazy on first use; there is nothing else to do here.
const quietly = (p: Promise<unknown>) => void p.catch(() => undefined);

/** The command post's panels, fetched once the page is idle. Returns a cancel for an unmount before then. */
export function prefetchDockPanels(): () => void {
  return whenIdle(() => {
    quietly(load.print());
    quietly(load.replay());
    quietly(load.check());
    quietly(load.geojson());
  });
}

/** The judge page's panels, fetched once the page is idle. */
export function prefetchJudgePanels(): () => void {
  return whenIdle(() => {
    quietly(load.replay());
    quietly(load.cube());
    quietly(load.scam());
  });
}
