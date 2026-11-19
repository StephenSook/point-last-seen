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
  /** The command post's delete-media control (counting and the server call); the menu shows it when given. */
  deleteMedia?: { count: () => Promise<{ clips: number; photos: number; records: number }>; run: () => Promise<number | null> };
};
