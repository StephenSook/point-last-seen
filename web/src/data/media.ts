// "Delete this search's clips and photos" (command only): the deleteIncidentMediaNow callable removes
// the incident's clips and photos and their reading records at once, for example when a family
// withdraws consent, instead of waiting for the 30-day lifecycle. The server checks the caller.

import { httpsCallable, type Functions } from "firebase/functions";
import { listAll, ref, type FirebaseStorage } from "firebase/storage";

export type MediaCounts = { clips: number; photos: number };

/** What is stored now, for the confirm question (members may list both folders). */
export async function countMedia(storage: FirebaseStorage, incidentId: string): Promise<MediaCounts> {
  const [clips, photos] = await Promise.all([listAll(ref(storage, `clips/${incidentId}`)), listAll(ref(storage, `photos/${incidentId}`))]);
  return { clips: clips.items.length, photos: photos.items.length };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function deleteQuestion(c: MediaCounts): string | null {
  if (c.clips + c.photos === 0) return null;
  return `Delete ${plural(c.clips, "clip", "clips")} and ${plural(c.photos, "photo", "photos")} for this search? This can't be undone.`;
}

export function deletedLine(deleted: number): string {
  return `Deleted ${plural(deleted, "item", "items")}: clips, photos and their readings.`;
}

// The server's refusals are plain sentences meant for the person; show them as they are.
const SERVER_SENTENCES = new Set(["Only the incident's command can delete its media.", "Sign in before deleting an incident's media."]);

export function deleteMediaMessage(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : "";
  if ((code.endsWith("permission-denied") || code.endsWith("unauthenticated")) && SERVER_SENTENCES.has(message)) return message;
  if (code.endsWith("unavailable")) return "No connection. Nothing was deleted. Try again when the link is back.";
  return "The clips and photos were not deleted. Try again.";
}

export async function deleteMediaNow(functions: Functions, incidentId: string): Promise<number> {
  const r = await httpsCallable<{ incidentId: string }, { deleted: number }>(functions, "deleteIncidentMediaNow")({ incidentId });
  return typeof r.data?.deleted === "number" ? r.data.deleted : 0;
}
