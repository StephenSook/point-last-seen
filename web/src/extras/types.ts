import type { PostState, ViewState } from "./laneC";

export type ExtrasMapLike = {
  addSource(id: string, source: unknown): unknown;
  getSource(id: string): unknown;
  removeSource(id: string): unknown;
  addLayer(layer: unknown): unknown;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  hasImage(id: string): boolean;
  addImage(id: string, image: ImageData): unknown;
};

export type DockProps = {
  incidentId: string;
  state: PostState;
  vs: ViewState | null;
  map: unknown;
  /** Harness and tests only: where the site's elevation file comes from. Defaults to the app's own origin. */
  loadElevation?: (gridId: string) => Promise<unknown>;
};
