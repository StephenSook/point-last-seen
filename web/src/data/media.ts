// "Delete this search's clips and photos" (command only): the deleteIncidentMediaNow callable removes
// the incident's clips and photos and their reading records at once, for example when a family
// withdraws consent, instead of waiting for the 30-day lifecycle. The server checks the caller.

import { collection, getCountFromServer, type Firestore } from "firebase/firestore";
import { httpsCallable, type Functions } from "firebase/functions";
import { listAll, ref, type FirebaseStorage } from "firebase/storage";

/** Files in Storage, and the clip and photo reading records (consent included) the server also deletes. */
export type MediaCounts = { clips: number; photos: number; records: number };

/** What is stored now, for the confirm question (command may list both folders and both collections). */
export async function countMedia(storage: FirebaseStorage, db: Firestore, incidentId: string): Promise<MediaCounts> {
  const [clips, photos, clipRecords, photoRecords] = await Promise.all([
    listAll(ref(storage, `clips/${incidentId}`)),
    listAll(ref(storage, `photos/${incidentId}`)),
    getCountFromServer(collection(db, "incidents", incidentId, "clipReadings")),
    getCountFromServer(collection(db, "incidents", incidentId, "photoReadings")),
  ]);
  return { clips: clips.items.length, photos: photos.items.length, records: clipRecords.data().count + photoRecords.data().count };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function deleteQuestion(c: MediaCounts): string | null {
  if (c.clips + c.photos === 0) {
    // A clip whose upload failed leaves its consent record with no file; the server deletes that too.
    if (c.records === 0) return null;
    return `Delete ${plural(c.records, "saved record", "saved records")} for this search's clips and photos? This can't be undone.`;
  }
  return `Delete ${plural(c.clips, "clip", "clips")} and ${plural(c.photos, "photo", "photos")} for this search? This can't be undone.`;
}

export function deletedLine(deleted: number | null): string {
  if (deleted === null) return "The delete finished, but the server did not say how many items it removed.";
  // The server's own number: two deletes running at once can both count the same files, so the dialog
  // reports it as the server's and then counts what is left.
  return `The server reports ${plural(deleted, "item", "items")} deleted: clips, photos and their readings.`;
}

/** The server's count, or null when the reply does not carry a whole, non-negative one. */
export function readDeletedCount(data: unknown): number | null {
  const n = typeof data === "object" && data !== null ? (data as { deleted?: unknown }).deleted : undefined;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

/** Said when the outcome is unknown: the dialog then counts again before offering Delete now. */
export const UNCONFIRMED = "The server did not confirm the delete. This shows what is stored now.";

// The server's refusals are plain sentences meant for the person, and it gives them before deleting
// anything, so they confirm nothing was deleted. Any other failure is unconfirmed: the server deletes
// files and records in steps, and its reply can be lost after the delete finished.
const SERVER_SENTENCES = new Set(["Only the incident's command can delete its media.", "Sign in before deleting an incident's media."]);

export function deleteFailure(e: unknown): { text: string; unconfirmed: boolean } {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : "";
  if ((code.endsWith("permission-denied") || code.endsWith("unauthenticated")) && SERVER_SENTENCES.has(message)) return { text: message, unconfirmed: false };
  return { text: UNCONFIRMED, unconfirmed: true };
}

export async function deleteMediaNow(functions: Functions, incidentId: string): Promise<number | null> {
  const r = await httpsCallable<{ incidentId: string }, unknown>(functions, "deleteIncidentMediaNow")({ incidentId });
  return readDeletedCount(r.data);
}
