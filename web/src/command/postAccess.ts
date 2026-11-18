// What the command post may keep on screen. A permission or auth denial means
// this browser is no longer a member of the incident, so every piece of its
// data leaves the screen and the listeners stop. A connection failure keeps
// the last data for offline viewing and says so.

import type { StreamedEvent } from "../data/events";
import type { IncidentView } from "../data/incident";

export type PostState = { view: IncidentView | null; events: StreamedEvent[]; denied: boolean; offline: boolean };

export const initialPostState: PostState = { view: null, events: [], denied: false, offline: false };

export type PostAction =
  | { type: "view"; view: IncidentView }
  | { type: "events"; events: StreamedEvent[] }
  | { type: "failed"; error: unknown };

export function listenerFailure(error: unknown): "denied" | "transient" {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  return code.endsWith("permission-denied") || code.endsWith("unauthenticated") ? "denied" : "transient";
}

export function postReducer(state: PostState, action: PostAction): PostState {
  if (state.denied) return state;
  switch (action.type) {
    case "view":
      return { ...state, view: action.view, offline: false };
    case "events":
      return { ...state, events: action.events, offline: false };
    case "failed":
      return listenerFailure(action.error) === "denied"
        ? { view: null, events: [], denied: true, offline: false }
        : { ...state, offline: true };
  }
}
