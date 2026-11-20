import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { SharedProfile } from "@pls/engine";
import approachNotes from "../../../shared/constants/approach-notes.json";
import routeSchema from "../../../shared/schemas/route-record.schema.json";
import { answersToLine } from "../data/profile";

// MapLibre looks for its worker next to its own module; after bundling that file is not there. Point it at
// the bundled worker, as the web app's own MapView does. Setting the same URL twice is harmless.
setWorkerUrl(workerUrl);

export { MapView } from "../map/MapView";
export { Map as MapLibreMap } from "maplibre-gl";
export { POA_RAMP, formatPct, type MapSegment } from "../map/poaStyle";
export { COMMAND } from "../theme/tokens";
export { viewState, type ViewState } from "../command/viewState";
export type { PostState } from "../command/postAccess";
export type { IncidentView, SegmentDoc, Team } from "../data/incident";
export type { StreamedEvent } from "../data/events";
export { mergeModel } from "../command/mergeModel";
export { DeleteMedia } from "../command/DeleteMedia";
export type { PublishedRun } from "../judge/judge";
/** The longest model id a route record holds (the shared route schema's own limit). */
export const ROUTE_MODEL_MAX: number = routeSchema.properties.model.maxLength;
export {
  DEFAULT_PARAMS,
  convergenceCode,
  isWellFormedEffect,
  type Assignment,
  type CameraSightingReading,
  type Effect,
  type EngineParams,
  type EventDoc,
  type PlanDoc,
  type RankedSegment,
  type RouteRecord,
  type SegmentPrior,
  type SharedProfile,
} from "@pls/engine";

// Paper leaves the app's control. Only how-to-approach guidance may print. A note about health, medication,
// mobility or risk to searchers is never printed, because which notes appear reveals the person's conditions.
const PRINTABLE_APPROACH_NOTE_IDS: ReadonlySet<string> = new Set([
  "may_not_respond", "approach_calm", "stop_calling_name", "likely_to_hide", "afraid_of_uniforms", "validate_feelings",
  "looking_for_home", "soft_voice", "sensitive_to_touch", "sensitive_to_light",
]);

export function printableApproachLines(ids: readonly string[]): string[] {
  const notes: Readonly<Record<string, { text: string; sourceRole: string }>> = approachNotes.notes;
  return ids.flatMap((id) => {
    if (!PRINTABLE_APPROACH_NOTE_IDS.has(id)) return [];
    const note = Object.hasOwn(notes, id) ? notes[id] : undefined;
    // Paper may carry fixed guidance from the shared card. Never interpolate personal fields.
    if (!note || note.sourceRole === "family" || note.text.includes("{")) return [];
    return [note.text];
  });
}

/**
 * The person lines paper may carry when command ticks the box: the names they answer to, exactly as the approach card
 * shows them, directly above the stop-calling note (or first, when that note is not shown), then the printable
 * approach notes. A person may answer only to an old name, and teams carry paper into the field.
 */
export function printablePersonLines(shared: SharedProfile | null): string[] {
  if (!shared) return [];
  const ids = Array.isArray(shared.approachNoteIds) ? shared.approachNoteIds : [];
  const notes = ids.flatMap((id) => printableApproachLines([id]).map((text) => ({ id, text })));
  const lines = notes.map(({ text }) => text);
  const names = answersToLine(shared);
  if (names) {
    const stop = notes.findIndex(({ id }) => id === "stop_calling_name");
    lines.splice(stop === -1 ? 0 : stop, 0, names);
  }
  return lines;
}

