import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import approachNotes from "../../../shared/constants/approach-notes.json";

// MapLibre looks for its worker next to its own module; after bundling that file is not there. Point it at
// the bundled worker, as lane C's MapView does (lane-web 3cf7bd0). Setting the same URL twice is harmless.
setWorkerUrl(workerUrl);

export { MapView } from "../map/MapView";
export { Map as MapLibreMap } from "maplibre-gl";
export { POA_RAMP, formatPct, type MapSegment } from "../map/poaStyle";
export { viewState, type ViewState } from "../command/viewState";
export type { PostState } from "../command/postAccess";
export type { IncidentView, SegmentDoc, Team } from "../data/incident";
export type { StreamedEvent } from "../data/events";
export { mergeModel } from "../command/mergeModel";
export type { PublishedRun } from "../judge/judge";
export {
  convergenceCode,
  type Assignment,
  type CameraSightingReading,
  type EngineParams,
  type EventDoc,
  type PlanDoc,
  type RankedSegment,
  type SegmentPrior,
} from "@pls/engine";

// Paper leaves the app's control. Only how-to-approach guidance may print. A note about health, medication,
// mobility or risk to searchers is never printed, because which notes appear reveals the person's conditions.
const PRINTABLE_APPROACH_NOTE_IDS: ReadonlySet<string> = new Set([
  "may_not_respond", "approach_calm", "likely_to_hide", "afraid_of_uniforms", "validate_feelings",
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
