// The clips this search has already read, for the command post's time machine: every clip record whose reading is
// a sighting (incidents/{id}/clipReadings, read from the server, never this device's cache), and the clip itself
// from Storage, used only when its SHA-256 matches its name. Built from the records, not from events, so a judge
// sandbox that holds a copied record and clip lists it too.

import type { CameraSightingInput } from "@pls/engine";
import { collection, getDocsFromServer, type Firestore } from "firebase/firestore";
import { getBytes, ref, type FirebaseStorage } from "firebase/storage";
import { parseCameraSighting } from "../ai/clipRead";
import { clipReadingFromDoc, type StoredClipReading } from "./clips";
import { sha256Hex } from "./photos";

const HASH = /^[0-9a-f]{64}$/;
const INCIDENT = /^[A-Za-z0-9_-]{1,128}$/;
/** The Storage rules' upload cap for a clip. */
const CLIP_MAX_BYTES = 14_000_000;

export const CLIP_CHANGED = "The stored clip does not match its reading.";

export type StoredClip = { record: StoredClipReading; sighting: CameraSightingInput };

export async function listStoredClips(db: Firestore, incidentId: string): Promise<StoredClip[]> {
  const snap = await getDocsFromServer(collection(db, "incidents", incidentId, "clipReadings"));
  const out: StoredClip[] = [];
  for (const d of snap.docs) {
    const record = clipReadingFromDoc(d.data());
    if (!record || record.sha256 !== d.id || !record.reading) continue;
    const sighting = parseCameraSighting(JSON.stringify(record.reading));
    if (sighting) out.push({ record, sighting });
  }
  return out.sort((a, b) => b.record.clipStartMs - a.record.clipStartMs || (a.record.sha256 < b.record.sha256 ? -1 : 1));
}

/** The clip's bytes from clips/{incident}/{sha256}.mp4; rejects when they are not the clip its name says. */
export async function loadStoredClip(storage: FirebaseStorage, incidentId: string, sha256: string): Promise<Uint8Array> {
  if (!HASH.test(sha256) || !INCIDENT.test(incidentId)) throw new Error("Not a stored clip.");
  const bytes = new Uint8Array(await getBytes(ref(storage, `clips/${incidentId}/${sha256}.mp4`), CLIP_MAX_BYTES));
  if ((await sha256Hex(bytes)) !== sha256) throw new Error(CLIP_CHANGED);
  return bytes;
}
